// Chat-stream handler. Exposed as a Lambda Function URL with RESPONSE_STREAM invoke
// mode. Verifies the Cognito JWT in-handler (jose), loads/creates a ChatSession in
// DynamoDB, runs the orchestrator, and streams SSE events back as the orchestrator +
// sub-agents work. After the orchestrator finishes the updated session is persisted
// and a final `session_saved` SSE event is emitted.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import OpenAI from "openai";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { randomUUID } from "node:crypto";

import { runOrchestrator } from "../../agents/orchestrator.js";
import type { AgentMessage } from "../../agents/_shared.js";
import type { ToolContext } from "../../tools/_types.js";

// Module-scope clients (reused across invocations on a warm Lambda).
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" });

const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID ?? "";
const COGNITO_REGION = process.env.COGNITO_REGION ?? "us-east-1";

const ISSUER = COGNITO_USER_POOL_ID
  ? `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}`
  : "";

const JWKS = COGNITO_USER_POOL_ID
  ? createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`))
  : null;

// Cap stored history; older messages drop off so a session row never grows unbounded.
const MAX_HISTORY_MESSAGES = 20;

// ---------- ToolContext ----------

function buildContext(userId: string): ToolContext {
  return {
    userId,
    ddb,
    s3,
    openai,
    env: {
      PROBLEM_TABLE: process.env.PROBLEM_TABLE ?? "",
      USER_TABLE: process.env.USER_TABLE ?? "",
      RATELIMIT_TABLE: process.env.RATELIMIT_TABLE ?? "",
      AI_LOGS_BUCKET: process.env.AI_LOGS_BUCKET ?? "",
      EXPORTS_BUCKET: process.env.EXPORTS_BUCKET ?? "",
      OPENAI_MODEL_EXTRACTION: process.env.OPENAI_MODEL_EXTRACTION ?? "gpt-5",
      OPENAI_MODEL_REASONING: process.env.OPENAI_MODEL_REASONING ?? "gpt-5",
      OPENAI_MODEL_INTENT: process.env.OPENAI_MODEL_INTENT ?? "gpt-5-mini",
      AI_DAILY_RATE_LIMIT: parseInt(process.env.AI_DAILY_RATE_LIMIT ?? "50", 10),
      MCP_TOOL_DAILY_LIMIT: parseInt(process.env.MCP_TOOL_DAILY_LIMIT ?? "200", 10)
    }
  };
}

// ---------- JWT verification ----------

async function verifyJwt(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) return null;
  if (!JWKS) return null;
  const token = authHeader.slice(7).trim();
  try {
    const { payload } = await jwtVerify(token, JWKS, { issuer: ISSUER });
    const sub = typeof payload.sub === "string" ? payload.sub : null;
    return sub;
  } catch {
    return null;
  }
}

// ---------- ChatSession persistence ----------

interface ChatSessionRow {
  id: string;
  userId: string;
  agentRoute: string;
  messages: AgentMessage[];
  createdAt: string;
  updatedAt: string;
}

async function loadOrCreateSession(userId: string, sessionId?: string): Promise<ChatSessionRow> {
  const table = process.env.CHATSESSION_TABLE;
  if (sessionId && table) {
    const out = await ddb.send(new GetCommand({
      TableName: table,
      Key: { id: sessionId }
    }));
    if (out.Item && out.Item.userId === userId) {
      const item = out.Item as any;
      return {
        id: item.id,
        userId: item.userId,
        agentRoute: item.agentRoute ?? "pending",
        messages: Array.isArray(item.messages) ? (item.messages as AgentMessage[]) : [],
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      };
    }
    // Fall through to create — session not found or wrong owner.
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  return { id, userId, agentRoute: "pending", messages: [], createdAt: now, updatedAt: now };
}

async function saveSession(session: ChatSessionRow): Promise<void> {
  const table = process.env.CHATSESSION_TABLE;
  if (!table) throw new Error("CHATSESSION_TABLE env var is not set");
  // Cap stored history so a row never grows unbounded.
  const trimmed = session.messages.slice(-MAX_HISTORY_MESSAGES);
  const now = new Date().toISOString();
  await ddb.send(new PutCommand({
    TableName: table,
    Item: {
      id: session.id,
      userId: session.userId,
      agentRoute: session.agentRoute,
      messages: trimmed,
      createdAt: session.createdAt,
      updatedAt: now,
      // Amplify GraphQL model markers — keep these so the row is queryable through
      // the Data API as well as via direct DDB access from the Lambda.
      __typename: "ChatSession",
      owner: session.userId
    }
  }));
}

// ---------- HTTP plumbing ----------

interface LambdaUrlEvent {
  rawPath?: string;
  rawQueryString?: string;
  requestContext?: {
    http?: {
      method?: string;
      path?: string;
    };
  };
  headers?: Record<string, string | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
}

function decodeBody(event: LambdaUrlEvent): string | undefined {
  if (event.body == null) return undefined;
  if (event.isBase64Encoded) return Buffer.from(event.body, "base64").toString("utf8");
  return event.body;
}

// Note: do NOT set access-control-allow-origin here. Lambda Function URL's CORS
// config (in amplify/backend.ts) injects it automatically. Setting it manually
// produces a duplicate ACAO header that browsers reject.

function writeJson(stream: any, status: number, body: object, extra?: Record<string, string>) {
  const payload = JSON.stringify(body);
  const wrapped = (globalThis as any).awslambda.HttpResponseStream.from(stream, {
    statusCode: status,
    headers: {
      "content-type": "application/json",
      ...(extra ?? {})
    }
  });
  wrapped.write(payload);
  wrapped.end();
}

function openSseStream(stream: any) {
  return (globalThis as any).awslambda.HttpResponseStream.from(stream, {
    statusCode: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "x-accel-buffering": "no"
    }
  });
}

// ---------- Top-level streaming handler ----------

const streamHandler = async (event: LambdaUrlEvent, responseStream: any /*, context */) => {
  const method = event.requestContext?.http?.method ?? "POST";

  // CORS preflight is handled by the Lambda Function URL's CORS config — it
  // never reaches this handler. If it somehow does (misconfig), short-circuit
  // with 204 and no headers; URL CORS will inject what it needs.
  if (method === "OPTIONS") {
    const wrapped = (globalThis as any).awslambda.HttpResponseStream.from(responseStream, {
      statusCode: 204,
      headers: {}
    });
    wrapped.end();
    return;
  }

  // 1. Verify JWT
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(event.headers ?? {})) {
    if (v != null) headers[k.toLowerCase()] = String(v);
  }
  const userId = await verifyJwt(headers["authorization"]);
  if (!userId) {
    writeJson(responseStream, 401, { error: "unauthorized" });
    return;
  }

  // 2. Parse body
  let body: {
    sessionId?: string;
    message?: string;
    pageContext?: { problemId?: unknown; problemNumber?: unknown; problemTitle?: unknown };
  };
  try {
    const raw = decodeBody(event);
    body = raw ? JSON.parse(raw) : {};
  } catch {
    writeJson(responseStream, 400, { error: "invalid_body" });
    return;
  }

  const message = body.message?.trim();
  if (!message) {
    writeJson(responseStream, 400, { error: "missing_message" });
    return;
  }

  // pageContext is optional. The PWA includes it when the user is on a
  // problem detail page so the tutor agent can answer "explain this" without
  // needing to call find_problem.
  const pageContext = body.pageContext && typeof body.pageContext === "object"
    ? {
        problemId: typeof body.pageContext.problemId === "string" ? body.pageContext.problemId : undefined,
        problemNumber: typeof body.pageContext.problemNumber === "number" ? body.pageContext.problemNumber : undefined,
        problemTitle: typeof body.pageContext.problemTitle === "string" ? body.pageContext.problemTitle : undefined
      }
    : undefined;

  // 3. Load or create session
  let session: ChatSessionRow;
  try {
    session = await loadOrCreateSession(userId, body.sessionId);
  } catch (err: any) {
    console.error("chat-stream loadOrCreateSession error", err);
    writeJson(responseStream, 500, { error: "session_load_failed" });
    return;
  }

  // 4. Open SSE stream
  const sse = openSseStream(responseStream);
  const writeEvent = (name: string, data: any) => {
    sse.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Emit the session id up front so the client can hold on to it even if the
  // orchestrator crashes mid-flight.
  writeEvent("session", { sessionId: session.id });

  // 5. Stream orchestrator events
  const ctx = buildContext(userId);
  const userMessage: AgentMessage = { role: "user", content: message };
  let finalAssistantMessage = "";
  let lastRoute = session.agentRoute;
  try {
    try {
      for await (const ev of runOrchestrator(ctx, session.messages, message, pageContext)) {
        writeEvent(ev.type, ev);
        if ((ev as any).type === "route") lastRoute = (ev as any).route;
        if (ev.type === "done") finalAssistantMessage = (ev as any).finalMessage ?? "";
      }
    } catch (err: any) {
      console.error("chat-stream orchestrator error", err);
      writeEvent("error", { message: err?.message ?? "orchestrator_failed" });
    }

    // 6. Persist updated session — bound to 5s so a stuck DDB write can't hang the
    // Lambda for the full 60s timeout. The user's message + any partial assistant
    // reply gets persisted on a best-effort basis.
    const updated: ChatSessionRow = {
      ...session,
      agentRoute: lastRoute,
      messages: [
        ...session.messages,
        userMessage,
        { role: "assistant", content: finalAssistantMessage }
      ]
    };
    try {
      await Promise.race([
        saveSession(updated),
        new Promise((_, rej) => setTimeout(() => rej(new Error("save_timeout")), 5000))
      ]);
      writeEvent("session_saved", { sessionId: session.id });
    } catch (err: any) {
      console.error("chat-stream saveSession error", err);
      writeEvent("session_save_failed", { error: err?.message ?? "save_failed" });
    }
  } finally {
    // Always close the SSE stream; otherwise the Lambda hangs until its 60s timeout
    // even if every code path above returned cleanly.
    try { sse.end(); } catch { /* already ended */ }
  }
};

// AWS Lambda's response-stream runtime exposes `awslambda.streamifyResponse` as a
// global injected at runtime. We export `handler` wrapped with it.
export const handler = (globalThis as any).awslambda?.streamifyResponse
  ? (globalThis as any).awslambda.streamifyResponse(streamHandler)
  : streamHandler;

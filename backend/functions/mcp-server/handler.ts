// MCP server handler. Exposed as a Lambda Function URL with RESPONSE_STREAM invoke
// mode. The single Lambda handles three URL paths:
//   1. GET  /.well-known/oauth-authorization-server  -> RFC 8414 metadata
//   2. POST /register                                -> DCR shim (static client id)
//   3. all other paths (POST /, POST /mcp, ...)      -> MCP Streamable HTTP transport
//
// JWT verification is performed in-handler via jose (RemoteJWKSet), so the Function URL
// is configured with authType=NONE.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import OpenAI from "openai";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { Server as McpServer } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { Socket } from "node:net";

import { ALL_TOOLS, toolByName } from "../../tools/index.js";
import type { ToolContext } from "../../tools/_types.js";

// Module-scope clients (reused across invocations on a warm Lambda).
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" });

const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID ?? "";
const COGNITO_REGION = process.env.COGNITO_REGION ?? "us-east-1";
const COGNITO_DOMAIN = process.env.COGNITO_DOMAIN ?? "";
const MCP_OAUTH_CLIENT_ID = process.env.MCP_OAUTH_CLIENT_ID ?? "";

const ISSUER = COGNITO_USER_POOL_ID
  ? `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${COGNITO_USER_POOL_ID}`
  : "";

const JWKS = COGNITO_USER_POOL_ID
  ? createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`))
  : null;

// Convenience: stable Cognito hosted-UI domain (Cognito's own domain prefix).
function hostedUiBase(): string {
  if (!COGNITO_DOMAIN) return "";
  return `https://${COGNITO_DOMAIN}.auth.${COGNITO_REGION}.amazoncognito.com`;
}

// ---------- ToolContext + rate limit ----------

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

async function bumpMcpToolCount(ctx: ToolContext): Promise<void> {
  const dayKey = new Date().toISOString().slice(0, 10);
  const ttl = Math.floor(Date.now() / 1000) + 7 * 86400;
  try {
    await ctx.ddb.send(new UpdateCommand({
      TableName: ctx.env.RATELIMIT_TABLE,
      Key: { userId: ctx.userId, dayKey },
      UpdateExpression: "ADD mcpToolCount :one SET #ttl = :ttl",
      ConditionExpression: "attribute_not_exists(mcpToolCount) OR mcpToolCount < :max",
      ExpressionAttributeNames: { "#ttl": "ttl" },
      ExpressionAttributeValues: {
        ":one": 1,
        ":ttl": ttl,
        ":max": ctx.env.MCP_TOOL_DAILY_LIMIT
      }
    }));
  } catch (err: any) {
    if (err.name === "ConditionalCheckFailedException") {
      throw new Error("MCP_TOOL_RATE_LIMIT_EXCEEDED");
    }
    throw err;
  }
}

// ---------- MCP server wiring ----------

function buildMcpServer(ctx: ToolContext): McpServer {
  const server = new McpServer(
    { name: "olivers-leetcode-tracker", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: Object.values(ALL_TOOLS).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.jsonSchema as any
    }))
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = toolByName(req.params.name);
    await bumpMcpToolCount(ctx);
    const validated = tool.inputSchema.parse(req.params.arguments ?? {});
    const result = await tool.execute(ctx, validated);
    return {
      content: [{ type: "text", text: JSON.stringify(result) }]
    };
  });

  return server;
}

// ---------- JWT verification ----------

async function verifyJwt(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) return null;
  if (!JWKS) return null;
  const token = authHeader.slice(7).trim();
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: ISSUER
      // We accept both id and access tokens. Audience claim differs between them
      // (id tokens have aud=clientId, access tokens have client_id), so we don't pin aud.
    });
    const sub = typeof payload.sub === "string" ? payload.sub : null;
    return sub;
  } catch {
    return null;
  }
}

// ---------- OAuth metadata + DCR shim ----------

function oauthMetadata(originUrl: URL) {
  // RFC 8414 — the Authorization Server is Cognito's hosted UI. The metadata document
  // is served from this Lambda as a convenience for clients that follow the well-known
  // discovery flow rooted at the resource server URL (i.e. this Lambda's URL).
  const base = hostedUiBase();
  const selfBase = `${originUrl.protocol}//${originUrl.host}`;
  return {
    issuer: ISSUER,
    authorization_endpoint: base ? `${base}/oauth2/authorize` : "",
    token_endpoint: base ? `${base}/oauth2/token` : "",
    userinfo_endpoint: base ? `${base}/oauth2/userInfo` : "",
    jwks_uri: ISSUER ? `${ISSUER}/.well-known/jwks.json` : "",
    registration_endpoint: `${selfBase}/register`,
    scopes_supported: ["openid", "email", "profile"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"]
  };
}

function dcrResponse() {
  // DCR shim: any client that POSTs to /register gets back the static MCP app client
  // id. This is what Anthropic/Claude Desktop expect when they "register" with us.
  return {
    client_id: MCP_OAUTH_CLIENT_ID,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    redirect_uris: [
      "https://claude.ai/api/mcp/auth_callback",
      "claude://oauth-callback",
      "http://localhost:3334/oauth/callback"
    ],
    token_endpoint_auth_method: "none",
    scope: "openid email profile"
  };
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
    domainName?: string;
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

function writeJson(stream: any, status: number, body: object, extra?: Record<string, string>) {
  // Note: do NOT set access-control-allow-origin here. Lambda Function URL's
  // CORS config (in amplify/backend.ts) injects it; setting it manually
  // produces a duplicate ACAO header that browsers reject.
  const payload = JSON.stringify(body);
  const metadata = {
    statusCode: status,
    headers: {
      "content-type": "application/json",
      ...(extra ?? {})
    }
  };
  // Lambda streaming requires HttpResponseStream.from() to set status/headers.
  const wrapped = (globalThis as any).awslambda.HttpResponseStream.from(stream, metadata);
  wrapped.write(payload);
  wrapped.end();
}

function writeError(stream: any, status: number, message: string, extra?: Record<string, string>) {
  writeJson(stream, status, { error: message }, extra);
}

// Build a node IncomingMessage / ServerResponse pair backed by the streaming response,
// so we can hand the request off to MCP's StreamableHTTPServerTransport.
function dispatchToTransport(
  event: LambdaUrlEvent,
  responseStream: any,
  transport: StreamableHTTPServerTransport,
  authSub: string
): Promise<void> {
  const method = event.requestContext?.http?.method ?? "POST";
  const path = event.rawPath ?? event.requestContext?.http?.path ?? "/";
  const url = path + (event.rawQueryString ? `?${event.rawQueryString}` : "");
  const bodyStr = decodeBody(event);
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(event.headers ?? {})) {
    if (v != null) headers[k.toLowerCase()] = String(v);
  }

  // Synthesize a duplex-ish IncomingMessage so MCP can read req.headers / parsedBody.
  const socket = new Socket();
  const req: any = new IncomingMessage(socket);
  req.method = method;
  req.url = url;
  req.headers = headers;
  req.auth = { token: "verified", clientId: authSub, scopes: [] };

  // Wrap the awslambda response stream as a node ServerResponse-ish target.
  // We capture status + headers and forward writes via HttpResponseStream.
  let wrapped: any | undefined;
  let status = 200;
  let respHeaders: Record<string, string> = {
    "content-type": "application/json"
  };
  const headersWritten = { v: false };

  const ensureWrapped = () => {
    if (wrapped) return wrapped;
    headersWritten.v = true;
    wrapped = (globalThis as any).awslambda.HttpResponseStream.from(responseStream, {
      statusCode: status,
      headers: respHeaders
    });
    return wrapped;
  };

  const res: any = {
    statusCode: 200,
    setHeader(name: string, value: string | string[]) {
      respHeaders[name.toLowerCase()] = Array.isArray(value) ? value.join(", ") : value;
    },
    getHeader(name: string) {
      return respHeaders[name.toLowerCase()];
    },
    removeHeader(name: string) {
      delete respHeaders[name.toLowerCase()];
    },
    writeHead(code: number, h?: Record<string, string>) {
      status = code;
      this.statusCode = code;
      if (h) {
        for (const [k, v] of Object.entries(h)) respHeaders[k.toLowerCase()] = String(v);
      }
      ensureWrapped();
    },
    write(chunk: any) {
      if (!wrapped) {
        // statusCode setter may have been used directly without writeHead.
        status = this.statusCode || status;
        ensureWrapped();
      }
      wrapped.write(chunk);
      return true;
    },
    end(chunk?: any) {
      if (!wrapped) {
        status = this.statusCode || status;
        ensureWrapped();
      }
      if (chunk != null) wrapped.write(chunk);
      wrapped.end();
    },
    flushHeaders() {
      ensureWrapped();
    },
    on() {},
    once() {}
  };

  let parsedBody: unknown = undefined;
  if (bodyStr) {
    try {
      parsedBody = JSON.parse(bodyStr);
    } catch {
      parsedBody = bodyStr;
    }
  }

  return transport.handleRequest(req as IncomingMessage & { auth?: any }, res as unknown as ServerResponse, parsedBody);
}

// ---------- Top-level streaming handler ----------

const streamHandler = async (event: LambdaUrlEvent, responseStream: any /*, context */) => {
  const method = event.requestContext?.http?.method ?? "POST";
  const path = event.rawPath ?? event.requestContext?.http?.path ?? "/";
  const host = event.requestContext?.domainName ?? "localhost";
  const originUrl = new URL(`https://${host}${path}`);

  // CORS preflight is handled by the Lambda Function URL's CORS config and
  // never reaches this handler in normal operation. If it does, return 204
  // with no CORS headers — Lambda Function URL adds its own.
  if (method === "OPTIONS") {
    const wrapped = (globalThis as any).awslambda.HttpResponseStream.from(responseStream, {
      statusCode: 204,
      headers: {}
    });
    wrapped.end();
    return;
  }

  // OAuth metadata (no auth required)
  if (method === "GET" && path.endsWith("/.well-known/oauth-authorization-server")) {
    writeJson(responseStream, 200, oauthMetadata(originUrl));
    return;
  }

  // DCR shim (no auth required — that's the whole point of dynamic client registration)
  if (method === "POST" && (path === "/register" || path.endsWith("/register"))) {
    writeJson(responseStream, 201, dcrResponse());
    return;
  }

  // All other paths: MCP transport. Auth required.
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(event.headers ?? {})) {
    if (v != null) headers[k.toLowerCase()] = String(v);
  }
  const userId = await verifyJwt(headers["authorization"]);
  if (!userId) {
    const resourceMetadataHint = `${originUrl.protocol}//${originUrl.host}/.well-known/oauth-authorization-server`;
    writeError(responseStream, 401, "unauthorized", {
      "www-authenticate": `Bearer realm="mcp", resource_metadata="${resourceMetadataHint}"`
    });
    return;
  }

  const ctx = buildContext(userId);
  const server = buildMcpServer(ctx);
  // Stateless mode: no session id generator; each request is independent.
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);

  try {
    await dispatchToTransport(event, responseStream, transport, userId);
  } catch (err: any) {
    console.error("mcp dispatch error", err);
    // If headers have not been written yet, we can still emit JSON. Otherwise the
    // stream is already in flight and we just abort.
    try {
      writeError(responseStream, 500, err?.message ?? "internal");
    } catch {
      try { responseStream.end(); } catch {}
    }
  }
};

// AWS Lambda's response-stream runtime exposes `awslambda.streamifyResponse` as a
// global injected at runtime. We export `handler` wrapped with it.
export const handler = (globalThis as any).awslambda?.streamifyResponse
  ? (globalThis as any).awslambda.streamifyResponse(streamHandler)
  : streamHandler;

import { z } from "zod";
import { UpdateCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ToolContext, ToolDefinition } from "./_types.js";
import { ProblemSchema } from "./_types.js";
import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_TOOL_DEFINITION } from "./_openai-extraction.js";

export const AddProblemInput = z.object({
  solutionText: z.string().min(10).max(50000)
});
export type AddProblemInput = z.infer<typeof AddProblemInput>;

const ExtractionResult = z.object({
  number: z.number().int().positive(),
  title: z.string().min(1),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
  tags: z.array(z.string()).min(1).max(8),
  description: z.string(),
  constraints: z.array(z.string()).default([]),
  language: z.enum(["python", "cpp", "java", "other"]),
  confidence: z.enum(["high", "low"])
});

export async function addProblem(ctx: ToolContext, input: AddProblemInput) {
  const { solutionText } = AddProblemInput.parse(input);
  const dayKey = new Date().toISOString().slice(0, 10);
  const ttl = Math.floor(Date.now() / 1000) + 7 * 86400;

  // 1. Atomic rate-limit increment
  try {
    await ctx.ddb.send(new UpdateCommand({
      TableName: ctx.env.RATELIMIT_TABLE,
      Key: { userId: ctx.userId, dayKey },
      UpdateExpression: "ADD aiCallCount :one SET #ttl = :ttl",
      ConditionExpression: "attribute_not_exists(aiCallCount) OR aiCallCount < :max",
      ExpressionAttributeNames: { "#ttl": "ttl" },
      ExpressionAttributeValues: { ":one": 1, ":ttl": ttl, ":max": ctx.env.AI_DAILY_RATE_LIMIT }
    }));
  } catch (err: any) {
    if (err.name === "ConditionalCheckFailedException") throw new Error("RATE_LIMIT_EXCEEDED");
    throw err;
  }

  // 2. OpenAI extraction (chat completions + forced function call)
  const requestId = randomUUID();
  const requestPayload = {
    model: ctx.env.OPENAI_MODEL_EXTRACTION,
    max_tokens: 1024,
    messages: [
      { role: "system" as const, content: EXTRACTION_SYSTEM_PROMPT },
      { role: "user" as const, content: solutionText }
    ],
    tools: [EXTRACTION_TOOL_DEFINITION],
    tool_choice: { type: "function" as const, function: { name: "record_extraction" } }
  };

  let response: any;
  try {
    response = await ctx.openai.chat.completions.create(requestPayload as any, { timeout: 15000 } as any);
  } catch (err: any) {
    // Roll back rate limit on infra failure (5xx, 429, timeout) — not on parse error.
    if ((err.status >= 500) || err.status === 429 || err.name === "TimeoutError" || err.name === "APIConnectionTimeoutError") {
      await ctx.ddb.send(new UpdateCommand({
        TableName: ctx.env.RATELIMIT_TABLE,
        Key: { userId: ctx.userId, dayKey },
        UpdateExpression: "ADD aiCallCount :neg",
        ExpressionAttributeValues: { ":neg": -1 }
      })).catch(() => {});
      throw new Error("AI_SERVICE_UNAVAILABLE");
    }
    throw err;
  }

  const toolCall = response.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.function?.name !== "record_extraction") {
    throw new Error("AI_INVALID_RESPONSE");
  }

  let extraction: z.infer<typeof ExtractionResult>;
  try {
    const parsed = JSON.parse(toolCall.function.arguments);
    extraction = ExtractionResult.parse(parsed);
  } catch {
    throw new Error("AI_INVALID_RESPONSE");
  }

  // 3. Persist Problem
  const id = randomUUID();
  const lang = extraction.language === "other" ? "python" : extraction.language;
  const solutions: Record<string, string> = { python: "", cpp: "", java: "" };
  solutions[lang] = solutionText;
  const now = new Date().toISOString();
  const item = {
    id, userId: ctx.userId,
    number: extraction.number,
    title: extraction.title,
    difficulty: extraction.difficulty,
    tags: extraction.tags,
    solvedAt: now,
    description: extraction.description,
    constraints: extraction.constraints,
    solutions,
    note: "",
    createdAt: now,
    updatedAt: now,
    __typename: "Problem",
    owner: ctx.userId
  };

  try {
    await ctx.ddb.send(new PutCommand({
      TableName: ctx.env.PROBLEM_TABLE,
      Item: item,
      ConditionExpression: "attribute_not_exists(id)"
    }));
  } catch {
    throw new Error("PERSIST_FAILED");
  }

  // 4. Fire-and-forget AI log to S3
  ctx.s3.send(new PutObjectCommand({
    Bucket: ctx.env.AI_LOGS_BUCKET,
    Key: `${dayKey.replace(/-/g, "/")}/${ctx.userId}/${requestId}.json`,
    Body: JSON.stringify({ requestId, userId: ctx.userId, request: requestPayload, response, extraction }),
    ContentType: "application/json"
  })).catch((e) => console.error("ai-log put failed", e));

  return ProblemSchema.parse(item);
}

export const addProblemTool: ToolDefinition<AddProblemInput, ReturnType<typeof addProblem> extends Promise<infer R> ? R : never> = {
  name: "add_problem",
  description: "Extract Leetcode problem metadata from pasted code via OpenAI, then persist a new tile in the user's tracker.",
  inputSchema: AddProblemInput,
  outputSchema: ProblemSchema,
  execute: addProblem,
  jsonSchema: zodToJsonSchema(AddProblemInput) as object
};

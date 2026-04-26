import { z } from "zod";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import OpenAI from "openai";

export interface ToolContext {
  userId: string;
  ddb: DynamoDBDocumentClient;
  s3: S3Client;
  openai: OpenAI;
  env: {
    PROBLEM_TABLE: string;
    USER_TABLE: string;
    RATELIMIT_TABLE: string;
    AI_LOGS_BUCKET: string;
    EXPORTS_BUCKET: string;
    OPENAI_MODEL_EXTRACTION: string;
    OPENAI_MODEL_REASONING: string;
    OPENAI_MODEL_INTENT: string;
    AI_DAILY_RATE_LIMIT: number;
    MCP_TOOL_DAILY_LIMIT: number;
  };
}

export const ProblemSchema = z.object({
  id: z.string(),
  userId: z.string(),
  number: z.number().int().positive(),
  title: z.string(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
  tags: z.array(z.string()),
  solvedAt: z.string().datetime(),
  description: z.string().nullable(),
  constraints: z.array(z.string()).nullable(),
  solutions: z.record(z.string()).nullable(),
  note: z.string().nullable()
});

export type Problem = z.infer<typeof ProblemSchema>;

// Each tool exports its definition in this shape
export interface ToolDefinition<I, O> {
  name: string;
  description: string;
  inputSchema: z.ZodType<I>;
  outputSchema: z.ZodType<O>;
  execute: (ctx: ToolContext, input: I) => Promise<O>;
  // JSON Schema for OpenAI function calling and MCP tool registry
  jsonSchema: object;
}

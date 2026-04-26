import { z } from "zod";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ToolContext, ToolDefinition } from "./_types.js";
import { ProblemSchema } from "./_types.js";

export const ListProblemsInput = z.object({
  filter: z
    .object({
      tags: z.array(z.string()).optional(),
      difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
      dateFrom: z.string().datetime().optional(),
      dateTo: z.string().datetime().optional()
    })
    .optional(),
  limit: z.number().int().min(1).max(200).default(50),
  cursor: z.string().optional()
});
export type ListProblemsInput = z.input<typeof ListProblemsInput>;

const ListProblemsOutput = z.object({
  items: z.array(ProblemSchema),
  cursor: z.string().optional()
});
export type ListProblemsOutput = z.infer<typeof ListProblemsOutput>;

export async function listProblems(
  ctx: ToolContext,
  input: ListProblemsInput
): Promise<ListProblemsOutput> {
  const { filter, limit, cursor } = ListProblemsInput.parse(input);

  const values: Record<string, any> = { ":u": ctx.userId };
  let keyExpr = "userId = :u";
  if (filter?.dateFrom && filter?.dateTo) {
    keyExpr += " AND solvedAt BETWEEN :from AND :to";
    values[":from"] = filter.dateFrom;
    values[":to"] = filter.dateTo;
  } else if (filter?.dateFrom) {
    keyExpr += " AND solvedAt >= :from";
    values[":from"] = filter.dateFrom;
  } else if (filter?.dateTo) {
    keyExpr += " AND solvedAt <= :to";
    values[":to"] = filter.dateTo;
  }

  const out = await ctx.ddb.send(
    new QueryCommand({
      TableName: ctx.env.PROBLEM_TABLE,
      IndexName: "byUserAndDate",
      KeyConditionExpression: keyExpr,
      ExpressionAttributeValues: values,
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: cursor ? JSON.parse(decodeURIComponent(cursor)) : undefined
    })
  );

  let items = (out.Items ?? []) as any[];
  if (filter?.tags?.length) {
    const set = new Set(filter.tags);
    items = items.filter(
      (it) => Array.isArray(it.tags) && it.tags.some((t: string) => set.has(t))
    );
  }
  if (filter?.difficulty) {
    items = items.filter((it) => it.difficulty === filter.difficulty);
  }

  const parsed = items.map((it) => ProblemSchema.parse(it));
  const nextCursor = out.LastEvaluatedKey
    ? encodeURIComponent(JSON.stringify(out.LastEvaluatedKey))
    : undefined;

  return { items: parsed, cursor: nextCursor };
}

export const listProblemsTool: ToolDefinition<ListProblemsInput, ListProblemsOutput> = {
  name: "list_problems",
  description:
    "List the authenticated user's problems with optional tag/difficulty/date filters. Returns paginated results, newest first.",
  inputSchema: ListProblemsInput,
  outputSchema: ListProblemsOutput,
  execute: listProblems,
  jsonSchema: zodToJsonSchema(ListProblemsInput) as object
};

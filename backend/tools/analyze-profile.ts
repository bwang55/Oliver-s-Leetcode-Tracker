import { z } from "zod";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ToolContext, ToolDefinition } from "./_types.js";

export const AnalyzeProfileInput = z.object({
  window: z.enum(["week", "month", "all"])
});
export type AnalyzeProfileInput = z.infer<typeof AnalyzeProfileInput>;

const AnalyzeProfileOutput = z.object({
  totalProblems: z.number().int().nonnegative(),
  byTag: z.record(z.number().int().nonnegative()),
  byDifficulty: z.object({
    EASY: z.number().int().nonnegative(),
    MEDIUM: z.number().int().nonnegative(),
    HARD: z.number().int().nonnegative()
  }),
  weakAreas: z.array(z.string()),
  strongAreas: z.array(z.string()),
  windowStart: z.string().datetime(),
  windowEnd: z.string().datetime()
});
export type AnalyzeProfileOutput = z.infer<typeof AnalyzeProfileOutput>;

const REFERENCE_TAGS = [
  "array","string","hash-map","two-pointer","sliding-window","binary-search",
  "dp","greedy","backtracking","tree","graph","bfs","dfs","heap","stack",
  "linked-list","sorting","bit-manipulation"
];

function windowStartIso(window: "week" | "month" | "all"): string {
  if (window === "all") return new Date(0).toISOString();
  const days = window === "week" ? 7 : 30;
  return new Date(Date.now() - days * 86400000).toISOString();
}

export async function analyzeProfile(
  ctx: ToolContext,
  input: AnalyzeProfileInput
): Promise<AnalyzeProfileOutput> {
  const { window } = AnalyzeProfileInput.parse(input);
  const windowStart = windowStartIso(window);
  const windowEnd = new Date().toISOString();

  const items: any[] = [];
  let lastKey: any = undefined;
  do {
    const out: any = await ctx.ddb.send(
      new QueryCommand({
        TableName: ctx.env.PROBLEM_TABLE,
        IndexName: "byUserAndDate",
        KeyConditionExpression: "userId = :u AND solvedAt >= :from",
        ExpressionAttributeValues: { ":u": ctx.userId, ":from": windowStart },
        ExclusiveStartKey: lastKey
      })
    );
    items.push(...(out.Items ?? []));
    lastKey = out.LastEvaluatedKey;
  } while (lastKey);

  const byTag: Record<string, number> = {};
  const byDifficulty = { EASY: 0, MEDIUM: 0, HARD: 0 };
  for (const it of items) {
    if (it.difficulty in byDifficulty) {
      byDifficulty[it.difficulty as "EASY" | "MEDIUM" | "HARD"]++;
    }
    for (const t of (it.tags ?? []) as string[]) {
      byTag[t] = (byTag[t] ?? 0) + 1;
    }
  }

  const refCounts = REFERENCE_TAGS.map((t) => ({ tag: t, count: byTag[t] ?? 0 }));
  refCounts.sort((a, b) => a.count - b.count);
  const weakAreas = refCounts.slice(0, 3).map((r) => r.tag);

  const strongAreas = Object.entries(byTag)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag]) => tag);

  return AnalyzeProfileOutput.parse({
    totalProblems: items.length,
    byTag,
    byDifficulty,
    weakAreas,
    strongAreas,
    windowStart,
    windowEnd
  });
}

export const analyzeProfileTool: ToolDefinition<AnalyzeProfileInput, AnalyzeProfileOutput> = {
  name: "analyze_profile",
  description:
    "Compute summary stats over the user's Leetcode practice within a time window. Identifies weak (low-coverage) and strong (high-frequency) areas.",
  inputSchema: AnalyzeProfileInput,
  outputSchema: AnalyzeProfileOutput,
  execute: analyzeProfile,
  jsonSchema: zodToJsonSchema(AnalyzeProfileInput) as object
};

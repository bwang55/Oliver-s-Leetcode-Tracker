import { z } from "zod";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ToolContext, ToolDefinition } from "./_types.js";

export const DailySummaryInput = z.object({
  date: z.string().optional()
});
export type DailySummaryInput = z.infer<typeof DailySummaryInput>;

const DailySummaryOutput = z.object({
  date: z.string(),
  count: z.number().int().nonnegative(),
  tagsCovered: z.record(z.number().int().nonnegative()),
  problems: z.array(
    z.object({
      id: z.string(),
      number: z.number().int().positive(),
      title: z.string(),
      difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
      solvedAt: z.string()
    })
  ),
  summary: z.string()
});
export type DailySummaryOutput = z.infer<typeof DailySummaryOutput>;

function isoDayKey(s?: string): string {
  const d = s ? new Date(s) : new Date();
  return d.toISOString().slice(0, 10);
}

export async function dailySummary(
  ctx: ToolContext,
  input: DailySummaryInput
): Promise<DailySummaryOutput> {
  const { date } = DailySummaryInput.parse(input);
  const dayKey = isoDayKey(date);
  const from = `${dayKey}T00:00:00.000Z`;
  const next = new Date(dayKey + "T00:00:00.000Z");
  next.setUTCDate(next.getUTCDate() + 1);
  const to = next.toISOString();

  const items: any[] = [];
  let lastKey: any = undefined;
  do {
    const out = await ctx.ddb.send(
      new QueryCommand({
        TableName: ctx.env.PROBLEM_TABLE,
        IndexName: "byUserAndDate",
        KeyConditionExpression: "userId = :u AND solvedAt BETWEEN :from AND :to",
        ExpressionAttributeValues: { ":u": ctx.userId, ":from": from, ":to": to },
        ExclusiveStartKey: lastKey
      })
    );
    items.push(...(out.Items ?? []));
    lastKey = out.LastEvaluatedKey;
  } while (lastKey);

  const tagsCovered: Record<string, number> = {};
  const diffCounts = { EASY: 0, MEDIUM: 0, HARD: 0 };
  for (const it of items) {
    if (it.difficulty in diffCounts) {
      diffCounts[it.difficulty as keyof typeof diffCounts]++;
    }
    for (const t of it.tags ?? []) {
      tagsCovered[t] = (tagsCovered[t] ?? 0) + 1;
    }
  }

  const problems = items.map((it) => ({
    id: it.id,
    number: it.number,
    title: it.title,
    difficulty: it.difficulty,
    solvedAt: it.solvedAt
  }));

  const count = items.length;
  let summary: string;
  if (count === 0) {
    summary = `No problems on ${dayKey}.`;
  } else {
    const diffParts = (["EASY", "MEDIUM", "HARD"] as const)
      .filter((d) => diffCounts[d] > 0)
      .map((d) => `${diffCounts[d]} ${d}`)
      .join(", ");
    const tagParts = Object.entries(tagsCovered)
      .map(([t, n]) => `${t} (${n})`)
      .join(", ");
    summary = `${count} problem${count > 1 ? "s" : ""} on ${dayKey}: ${diffParts}. Tags covered: ${tagParts || "none"}.`;
  }

  return DailySummaryOutput.parse({ date: dayKey, count, tagsCovered, problems, summary });
}

export const dailySummaryTool: ToolDefinition<DailySummaryInput, DailySummaryOutput> = {
  name: "daily_summary",
  description:
    "Summarize the user's solved problems on a specific date (defaults to today).",
  inputSchema: DailySummaryInput,
  outputSchema: DailySummaryOutput,
  execute: dailySummary,
  jsonSchema: zodToJsonSchema(DailySummaryInput) as object
};

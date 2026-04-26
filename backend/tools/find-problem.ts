// find_problem — resolves a user-friendly reference (Leetcode number, title, or
// partial title) to one or more rows in the user's tracker. Returns the row's
// internal UUID `id` so the caller (typically the Curator agent) can chain
// into get_problem / update_problem / delete_problem.

import { z } from "zod";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ToolContext, ToolDefinition } from "./_types.js";

export const FindProblemInput = z.object({
  query: z.string().min(1).max(200)
});
export type FindProblemInput = z.infer<typeof FindProblemInput>;

const FindProblemOutput = z.object({
  matches: z.array(z.object({
    id: z.string(),
    number: z.number().int().positive(),
    title: z.string(),
    difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
    solvedAt: z.string()
  })),
  exactMatchByNumber: z.boolean()
});
export type FindProblemOutput = z.infer<typeof FindProblemOutput>;

export async function findProblem(ctx: ToolContext, input: FindProblemInput): Promise<FindProblemOutput> {
  const { query } = FindProblemInput.parse(input);

  // Pull the user's full tracker. Cheap for portfolio-scale users.
  const items: any[] = [];
  let lastKey: any = undefined;
  do {
    const out = await ctx.ddb.send(new QueryCommand({
      TableName: ctx.env.PROBLEM_TABLE,
      IndexName: "byUserAndDate",
      KeyConditionExpression: "userId = :u",
      ExpressionAttributeValues: { ":u": ctx.userId },
      ExclusiveStartKey: lastKey
    }));
    items.push(...(out.Items ?? []));
    lastKey = out.LastEvaluatedKey;
  } while (lastKey);

  // Try parsing as a Leetcode number first (e.g. "17", "#17", "problem 17").
  const numMatch = query.match(/\b(\d{1,4})\b/);
  if (numMatch) {
    const n = parseInt(numMatch[1], 10);
    const exact = items.filter((it) => it.number === n);
    if (exact.length > 0) {
      return {
        matches: exact.map(toBrief),
        exactMatchByNumber: true
      };
    }
  }

  // Fall back to case-insensitive substring match on title.
  const q = query.toLowerCase().trim();
  const titleMatches = items.filter((it) =>
    typeof it.title === "string" && it.title.toLowerCase().includes(q)
  );

  // If still nothing, try matching individual words from the query — useful when
  // the user types a partial title in a different word order.
  let fuzzy: any[] = [];
  if (titleMatches.length === 0 && q.length > 3) {
    const words = q.split(/\s+/).filter((w) => w.length > 2);
    if (words.length > 0) {
      fuzzy = items.filter((it) =>
        typeof it.title === "string" &&
        words.every((w) => it.title.toLowerCase().includes(w))
      );
    }
  }

  return {
    matches: (titleMatches.length ? titleMatches : fuzzy).slice(0, 10).map(toBrief),
    exactMatchByNumber: false
  };
}

function toBrief(it: any) {
  return {
    id: it.id,
    number: it.number,
    title: it.title,
    difficulty: it.difficulty,
    solvedAt: it.solvedAt
  };
}

export const findProblemTool: ToolDefinition<FindProblemInput, FindProblemOutput> = {
  name: "find_problem",
  description: "Find a row in the user's tracker by Leetcode number, exact title, or partial title. Returns matching rows with their internal `id` for use with get/update/delete_problem.",
  inputSchema: FindProblemInput,
  outputSchema: FindProblemOutput,
  execute: findProblem,
  jsonSchema: zodToJsonSchema(FindProblemInput) as object
};

import { z } from "zod";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ToolContext, ToolDefinition } from "./_types.js";
// Inline the bank as an ESM JSON import so esbuild bundles it into the Lambda
// artifact. (Reading from disk via fs.readFileSync fails in Lambda because
// `defineFunction` only ships the bundled JS, not adjacent data files.)
import bankData from "./data/problem-bank.json";

interface BankEntry {
  number: number;
  title: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  tags: string[];
  url: string;
  prerequisiteTags: string[];
}

const bank: BankEntry[] = bankData as BankEntry[];

export const SuggestNextProblemInput = z.object({
  focus: z.string().optional()
});
export type SuggestNextProblemInput = z.infer<typeof SuggestNextProblemInput>;

const SuggestNextProblemOutput = z.object({
  suggestion: z.object({
    number: z.number().int().positive(),
    title: z.string(),
    difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
    tags: z.array(z.string()),
    url: z.string().url()
  }),
  rationale: z.string()
});
export type SuggestNextProblemOutput = z.infer<typeof SuggestNextProblemOutput>;

export async function suggestNextProblem(
  ctx: ToolContext,
  input: SuggestNextProblemInput
): Promise<SuggestNextProblemOutput> {
  const { focus } = SuggestNextProblemInput.parse(input);

  // Page-scan all of the user's solved problems via the byUserAndDate GSI.
  const solvedNumbers = new Set<number>();
  const userTagCounts: Record<string, number> = {};
  let lastKey: Record<string, any> | undefined = undefined;
  do {
    const out: any = await ctx.ddb.send(
      new QueryCommand({
        TableName: ctx.env.PROBLEM_TABLE,
        IndexName: "byUserAndDate",
        KeyConditionExpression: "userId = :u",
        ExpressionAttributeValues: { ":u": ctx.userId },
        ExclusiveStartKey: lastKey
      })
    );
    for (const it of (out.Items ?? []) as any[]) {
      if (typeof it.number === "number") solvedNumbers.add(it.number);
      const tags = (it.tags as string[] | undefined) ?? [];
      for (const t of tags) {
        userTagCounts[t] = (userTagCounts[t] ?? 0) + 1;
      }
    }
    lastKey = out.LastEvaluatedKey;
  } while (lastKey);

  let candidates = bank.filter((p) => !solvedNumbers.has(p.number));

  if (focus) {
    candidates = candidates.filter((p) => p.tags.includes(focus));
    if (candidates.length === 0) throw new Error("BANK_EXHAUSTED");

    const focusCount = userTagCounts[focus] ?? 0;
    const preferredDifficulty: "EASY" | "MEDIUM" | "HARD" =
      focusCount < 3 ? "EASY" : "MEDIUM";

    const ranked = [...candidates].sort((a, b) => {
      const score = (d: "EASY" | "MEDIUM" | "HARD") =>
        d === preferredDifficulty ? 0 : d === "HARD" ? 2 : 1;
      const aD = score(a.difficulty);
      const bD = score(b.difficulty);
      if (aD !== bD) return aD - bD;
      return a.number - b.number;
    });
    const pick = ranked[0];
    return SuggestNextProblemOutput.parse({
      suggestion: {
        number: pick.number,
        title: pick.title,
        difficulty: pick.difficulty,
        tags: pick.tags,
        url: pick.url
      },
      rationale: `Recommended ${pick.title} (#${pick.number}) — covers your focus area "${focus}", at ${pick.difficulty} difficulty (you've done ${focusCount} ${focus} problems so far).`
    });
  }

  if (candidates.length === 0) throw new Error("BANK_EXHAUSTED");

  // Score by tag-coverage gap: candidates whose tags the user hasn't done much score higher.
  const scored = candidates.map((p) => {
    const score = p.tags.reduce(
      (acc, t) => acc + 1 / (1 + (userTagCounts[t] ?? 0)),
      0
    );
    return { p, score };
  });
  scored.sort((a, b) => b.score - a.score || a.p.number - b.p.number);
  const pick = scored[0].p;

  // Build a rationale describing the gap.
  const gapTags = pick.tags
    .map((t) => ({ t, c: userTagCounts[t] ?? 0 }))
    .sort((a, b) => a.c - b.c)
    .slice(0, 2);
  const gapDesc = gapTags.map((g) => `${g.t} (${g.c} done)`).join(", ");

  return SuggestNextProblemOutput.parse({
    suggestion: {
      number: pick.number,
      title: pick.title,
      difficulty: pick.difficulty,
      tags: pick.tags,
      url: pick.url
    },
    rationale: `Recommended ${pick.title} (#${pick.number}, ${pick.difficulty}) — covers underused areas: ${gapDesc}.`
  });
}

export const suggestNextProblemTool: ToolDefinition<
  SuggestNextProblemInput,
  SuggestNextProblemOutput
> = {
  name: "suggest_next_problem",
  description:
    "Recommend the next LeetCode problem to solve, optionally biased toward a focus tag. Excludes already-solved problems and scores candidates by tag-coverage gap.",
  inputSchema: SuggestNextProblemInput,
  outputSchema: SuggestNextProblemOutput,
  execute: suggestNextProblem,
  jsonSchema: zodToJsonSchema(SuggestNextProblemInput) as object
};

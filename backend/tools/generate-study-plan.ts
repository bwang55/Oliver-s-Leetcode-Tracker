import { z } from "zod";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { zodToJsonSchema } from "zod-to-json-schema";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { ToolContext, ToolDefinition } from "./_types.js";
import { analyzeProfile } from "./analyze-profile.js";

interface BankEntry {
  number: number;
  title: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  tags: string[];
  url: string;
  prerequisiteTags: string[];
}

let _bank: BankEntry[] | null = null;
function loadBank(): BankEntry[] {
  if (_bank) return _bank;
  const here = dirname(fileURLToPath(import.meta.url));
  _bank = JSON.parse(
    readFileSync(join(here, "data", "problem-bank.json"), "utf-8")
  ) as BankEntry[];
  return _bank;
}

export const GenerateStudyPlanInput = z.object({
  days: z.number().int().min(1).max(30),
  focus: z.string().optional()
});
export type GenerateStudyPlanInput = z.infer<typeof GenerateStudyPlanInput>;

const DayPlan = z.object({
  day: z.number().int().positive(),
  problem: z.object({
    number: z.number().int().positive(),
    title: z.string(),
    difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
    tags: z.array(z.string()),
    url: z.string().url()
  }),
  rationale: z.string()
});

const GenerateStudyPlanOutput = z.object({
  plan: z.array(DayPlan),
  summary: z.string()
});
export type GenerateStudyPlanOutput = z.infer<typeof GenerateStudyPlanOutput>;

export async function generateStudyPlan(
  ctx: ToolContext,
  input: GenerateStudyPlanInput
): Promise<GenerateStudyPlanOutput> {
  const { days, focus } = GenerateStudyPlanInput.parse(input);
  const bank = loadBank();

  // Step 1: analyze user's profile to inform the focus tag.
  const profile = await analyzeProfile(ctx, { window: "month" });
  const effectiveFocus = focus ?? profile.weakAreas[0];

  // Step 2: collect the user's solved problem numbers via the byUserAndDate GSI.
  // We re-query (rather than reusing analyzeProfile's items) to get the full
  // history independent of the time window.
  const solvedNumbers = new Set<number>();
  const userTagCounts: Record<string, number> = { ...profile.byTag };
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
    }
    lastKey = out.LastEvaluatedKey;
  } while (lastKey);

  // Step 3: build the plan, picking one problem per day with an evolving
  // exclusion set (already-solved + already-in-plan) and gap-coverage scoring.
  const plan: z.infer<typeof DayPlan>[] = [];
  const planNumbers = new Set<number>();

  for (let day = 1; day <= days; day++) {
    let candidates = bank.filter(
      (p) => !solvedNumbers.has(p.number) && !planNumbers.has(p.number)
    );
    if (effectiveFocus) {
      const focused = candidates.filter((p) =>
        p.tags.includes(effectiveFocus)
      );
      if (focused.length > 0) candidates = focused;
    }
    if (candidates.length === 0) break;

    const scored = candidates.map((p) => {
      const score = p.tags.reduce(
        (acc, t) => acc + 1 / (1 + (userTagCounts[t] ?? 0)),
        0
      );
      return { p, score };
    });
    scored.sort((a, b) => b.score - a.score || a.p.number - b.p.number);
    const pick = scored[0].p;

    const rationale =
      effectiveFocus && pick.tags.includes(effectiveFocus)
        ? `Day ${day}: ${pick.title} (#${pick.number}, ${pick.difficulty}) covers your focus "${effectiveFocus}".`
        : `Day ${day}: ${pick.title} (#${pick.number}, ${pick.difficulty}) covers ${pick.tags.slice(0, 2).join(", ")}.`;

    plan.push({
      day,
      problem: {
        number: pick.number,
        title: pick.title,
        difficulty: pick.difficulty,
        tags: pick.tags,
        url: pick.url
      },
      rationale
    });
    planNumbers.add(pick.number);
    for (const t of pick.tags) {
      userTagCounts[t] = (userTagCounts[t] ?? 0) + 1;
    }
  }

  // Step 4: compose the summary.
  let summary: string;
  if (plan.length === 0) {
    summary = `Could not generate a plan: bank exhausted${effectiveFocus ? ` for focus "${effectiveFocus}"` : ""}.`;
  } else if (plan.length < days) {
    summary = `${plan.length}-day plan${effectiveFocus ? ` focused on ${effectiveFocus}` : ""} (requested ${days}, only ${plan.length} unique candidates remained — bank exhausted).`;
  } else {
    summary = `${days}-day plan${effectiveFocus ? ` focused on ${effectiveFocus} (your weak area)` : ""}. Total problems: ${plan.length}.`;
  }

  return GenerateStudyPlanOutput.parse({ plan, summary });
}

export const generateStudyPlanTool: ToolDefinition<
  GenerateStudyPlanInput,
  GenerateStudyPlanOutput
> = {
  name: "generate_study_plan",
  description:
    "Generate a multi-day Leetcode study plan tailored to the user's history and an optional focus tag. Combines analyze_profile with per-day gap-coverage selection.",
  inputSchema: GenerateStudyPlanInput,
  outputSchema: GenerateStudyPlanOutput,
  execute: generateStudyPlan,
  jsonSchema: zodToJsonSchema(GenerateStudyPlanInput) as object
};

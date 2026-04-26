import { z } from "zod";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ToolContext, ToolDefinition } from "./_types.js";
import { ProblemSchema } from "./_types.js";

export const ExplainProblemInput = z.object({
  id: z.string().min(1)
});
export type ExplainProblemInput = z.infer<typeof ExplainProblemInput>;

const ExplainProblemOutput = z.object({
  problemNumber: z.number().int().positive(),
  problemTitle: z.string(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
  explanation: z.string()
});
export type ExplainProblemOutput = z.infer<typeof ExplainProblemOutput>;

const TUTOR_PROMPT = `You are a Leetcode tutor explaining a problem to someone preparing for interviews. Given a problem (number, title, difficulty, tags, description, constraints) and possibly the user's existing solution, write a concise tutorial.

Structure your explanation in this order:
1. **What the problem is asking** — restate in plain language, 2-3 sentences max.
2. **Approach** — the canonical algorithmic strategy. Name the technique (e.g. "two-pointer", "monotonic stack", "DP on subsequence"). Explain WHY this technique fits.
3. **Walkthrough** — pseudocode-level outline (5-8 short lines). Use the user's solution as a reference if provided.
4. **Complexity** — time and space, with one-line justification.
5. **Common pitfalls** — 1-2 things people mess up on this problem.

Keep it tight. Total 200-350 words. Use markdown headings (### in this case). Don't restate constraints verbatim — pull out only the ones that affect the algorithm choice.`;

export async function explainProblem(
  ctx: ToolContext,
  input: ExplainProblemInput
): Promise<ExplainProblemOutput> {
  const { id } = ExplainProblemInput.parse(input);
  const out = await ctx.ddb.send(
    new GetCommand({ TableName: ctx.env.PROBLEM_TABLE, Key: { id } })
  );
  if (!out.Item) throw new Error("NOT_FOUND");
  if (out.Item.userId !== ctx.userId) throw new Error("NOT_FOUND");
  const problem = ProblemSchema.parse(out.Item);

  const userSolution = problem.solutions
    ? Object.entries(problem.solutions)
        .filter(([, code]) => typeof code === "string" && code.trim().length > 0)
        .map(([lang, code]) => `\`\`\`${lang}\n${code}\n\`\`\``)
        .join("\n\n")
    : "";

  const userMessage = [
    `Problem #${problem.number}: ${problem.title} (${problem.difficulty})`,
    `Tags: ${problem.tags.join(", ") || "(none)"}`,
    "",
    `Description:`,
    problem.description ?? "(no description)",
    "",
    problem.constraints?.length
      ? `Constraints:\n${problem.constraints.map((c) => `- ${c}`).join("\n")}`
      : "",
    "",
    userSolution ? `User's existing solution(s):\n${userSolution}` : "(user has not submitted a solution yet)"
  ]
    .filter(Boolean)
    .join("\n");

  const resp = await ctx.openai.chat.completions.create({
    model: ctx.env.OPENAI_MODEL_REASONING,
    max_completion_tokens: 1500,
    messages: [
      { role: "system", content: TUTOR_PROMPT },
      { role: "user", content: userMessage }
    ]
  });

  const explanation = resp.choices[0]?.message?.content?.trim() ?? "";
  if (!explanation) throw new Error("EMPTY_EXPLANATION");

  return ExplainProblemOutput.parse({
    problemNumber: problem.number,
    problemTitle: problem.title,
    difficulty: problem.difficulty,
    explanation
  });
}

export const explainProblemTool: ToolDefinition<ExplainProblemInput, ExplainProblemOutput> = {
  name: "explain_problem",
  description:
    "Generate a tutorial-style explanation of a problem (what it's asking, approach, complexity, pitfalls). Owner-scoped via problem id. Use this when the user asks you to explain or walk through a problem.",
  inputSchema: ExplainProblemInput,
  outputSchema: ExplainProblemOutput,
  execute: explainProblem,
  jsonSchema: zodToJsonSchema(ExplainProblemInput) as object
};

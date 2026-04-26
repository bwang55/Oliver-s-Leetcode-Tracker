import { z } from "zod";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ToolContext, ToolDefinition } from "./_types.js";
import { ProblemSchema } from "./_types.js";

export const AddCommentsToCodeInput = z.object({
  id: z.string().min(1),
  language: z.enum(["python", "cpp", "java"])
});
export type AddCommentsToCodeInput = z.infer<typeof AddCommentsToCodeInput>;

const AddCommentsToCodeOutput = z.object({
  problemNumber: z.number().int().positive(),
  problemTitle: z.string(),
  language: z.enum(["python", "cpp", "java"]),
  commentedCode: z.string(),
  written: z.boolean() // true when persisted to DDB
});
export type AddCommentsToCodeOutput = z.infer<typeof AddCommentsToCodeOutput>;

const COMMENT_PROMPT = `You add concise inline comments to existing code. Rules:

1. **Don't change the code logic.** No refactoring, no renaming, no reordering. Only add comments.
2. **Comment the WHY, not the WHAT.** "loop over nums" is bad. "skip duplicates so the result is unique" is good.
3. **Comment density**: 1 comment per 3-5 lines of non-trivial code. Trivial lines (variable init, print, return) get nothing.
4. **Top-of-function block comment** (3-5 lines) explaining the algorithm and complexity. Use the language's idiomatic block comment style.
5. **Output the commented code only.** No prose, no markdown fences, no explanations before or after.`;

export async function addCommentsToCode(
  ctx: ToolContext,
  input: AddCommentsToCodeInput
): Promise<AddCommentsToCodeOutput> {
  const { id, language } = AddCommentsToCodeInput.parse(input);
  const out = await ctx.ddb.send(
    new GetCommand({ TableName: ctx.env.PROBLEM_TABLE, Key: { id } })
  );
  if (!out.Item) throw new Error("NOT_FOUND");
  if (out.Item.userId !== ctx.userId) throw new Error("NOT_FOUND");
  const problem = ProblemSchema.parse(out.Item);

  const sourceCode = problem.solutions?.[language];
  if (!sourceCode || !sourceCode.trim()) {
    throw new Error(`NO_SOLUTION_FOR_LANGUAGE: ${language}`);
  }

  const resp = await ctx.openai.chat.completions.create({
    model: ctx.env.OPENAI_MODEL_REASONING,
    max_completion_tokens: 2000,
    messages: [
      { role: "system", content: COMMENT_PROMPT },
      {
        role: "user",
        content: `Language: ${language}\nProblem: #${problem.number} ${problem.title}\n\n${sourceCode}`
      }
    ]
  });

  let commentedCode = resp.choices[0]?.message?.content?.trim() ?? "";
  if (!commentedCode) throw new Error("EMPTY_COMMENT_OUTPUT");

  // Models sometimes wrap output in ```language\n...\n``` despite the
  // instruction. Strip if present.
  const fenceMatch = commentedCode.match(/^```(?:\w+)?\n([\s\S]*?)\n```$/);
  if (fenceMatch) commentedCode = fenceMatch[1];

  // Persist the commented version back to the Problem row.
  const nextSolutions = { ...(problem.solutions ?? {}), [language]: commentedCode };
  await ctx.ddb.send(
    new UpdateCommand({
      TableName: ctx.env.PROBLEM_TABLE,
      Key: { id },
      UpdateExpression: "SET solutions = :s",
      ExpressionAttributeValues: { ":s": nextSolutions }
    })
  );

  return AddCommentsToCodeOutput.parse({
    problemNumber: problem.number,
    problemTitle: problem.title,
    language,
    commentedCode,
    written: true
  });
}

export const addCommentsToCodeTool: ToolDefinition<AddCommentsToCodeInput, AddCommentsToCodeOutput> = {
  name: "add_comments_to_code",
  description:
    "Add concise inline comments to the user's existing solution for a problem (in the specified language) and persist the commented version back to their tracker. Owner-scoped via problem id. Use this when the user asks you to comment, annotate, or explain their code.",
  inputSchema: AddCommentsToCodeInput,
  outputSchema: AddCommentsToCodeOutput,
  execute: addCommentsToCode,
  jsonSchema: zodToJsonSchema(AddCommentsToCodeInput) as object
};

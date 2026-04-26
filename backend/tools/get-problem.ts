import { z } from "zod";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ToolContext, ToolDefinition } from "./_types.js";
import { ProblemSchema, type Problem } from "./_types.js";

export const GetProblemInput = z.object({ id: z.string().min(1) });
export type GetProblemInput = z.infer<typeof GetProblemInput>;

export async function getProblem(
  ctx: ToolContext,
  input: GetProblemInput
): Promise<Problem> {
  const { id } = GetProblemInput.parse(input);
  const out = await ctx.ddb.send(
    new GetCommand({
      TableName: ctx.env.PROBLEM_TABLE,
      Key: { id }
    })
  );
  if (!out.Item) throw new Error("NOT_FOUND");
  if (out.Item.userId !== ctx.userId) throw new Error("NOT_FOUND");
  return ProblemSchema.parse(out.Item);
}

export const getProblemTool: ToolDefinition<GetProblemInput, Problem> = {
  name: "get_problem",
  description: "Fetch a single Problem by id. Owner-scoped (returns NOT_FOUND if not owned).",
  inputSchema: GetProblemInput,
  outputSchema: ProblemSchema,
  execute: getProblem,
  jsonSchema: zodToJsonSchema(GetProblemInput) as object
};

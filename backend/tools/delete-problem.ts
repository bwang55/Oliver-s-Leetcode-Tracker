import { z } from "zod";
import { DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ToolContext, ToolDefinition } from "./_types.js";

export const DeleteProblemInput = z.object({
  id: z.string().min(1)
});
export type DeleteProblemInput = z.infer<typeof DeleteProblemInput>;

const DeleteProblemOutput = z.object({ deletedId: z.string() });
export type DeleteProblemOutput = z.infer<typeof DeleteProblemOutput>;

export async function deleteProblem(
  ctx: ToolContext,
  input: DeleteProblemInput
): Promise<DeleteProblemOutput> {
  const { id } = DeleteProblemInput.parse(input);
  try {
    await ctx.ddb.send(
      new DeleteCommand({
        TableName: ctx.env.PROBLEM_TABLE,
        Key: { id },
        ConditionExpression: "userId = :u",
        ExpressionAttributeValues: { ":u": ctx.userId }
      })
    );
  } catch (err: any) {
    if (err?.name === "ConditionalCheckFailedException") {
      throw new Error("NOT_FOUND_OR_FORBIDDEN");
    }
    throw err;
  }
  return { deletedId: id };
}

export const deleteProblemTool: ToolDefinition<DeleteProblemInput, DeleteProblemOutput> = {
  name: "delete_problem",
  description: "Delete a Problem from the user's tracker. Owner-scoped.",
  inputSchema: DeleteProblemInput,
  outputSchema: DeleteProblemOutput,
  execute: deleteProblem,
  jsonSchema: zodToJsonSchema(DeleteProblemInput) as object
};

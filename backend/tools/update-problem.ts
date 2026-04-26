import { z } from "zod";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ToolContext, ToolDefinition } from "./_types.js";
import { ProblemSchema, type Problem } from "./_types.js";

export const UpdateProblemInput = z.object({
  id: z.string().min(1),
  fields: z
    .object({
      tags: z.array(z.string()).min(1).max(20).optional(),
      note: z.string().max(5000).optional(),
      difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional()
    })
    .refine(
      (f) =>
        f.tags !== undefined ||
        f.note !== undefined ||
        f.difficulty !== undefined,
      { message: "at least one field required" }
    )
});
export type UpdateProblemInput = z.infer<typeof UpdateProblemInput>;

export async function updateProblem(
  ctx: ToolContext,
  input: UpdateProblemInput
): Promise<Problem> {
  const { id, fields } = UpdateProblemInput.parse(input);

  const sets: string[] = ["updatedAt = :updatedAt"];
  const values: Record<string, unknown> = {
    ":u": ctx.userId,
    ":updatedAt": new Date().toISOString()
  };
  const names: Record<string, string> = {};

  if (fields.tags !== undefined) {
    sets.push("tags = :tags");
    values[":tags"] = fields.tags;
  }
  if (fields.note !== undefined) {
    // `note` is a DynamoDB reserved word -> use ExpressionAttributeNames
    sets.push("#n = :note");
    values[":note"] = fields.note;
    names["#n"] = "note";
  }
  if (fields.difficulty !== undefined) {
    sets.push("difficulty = :difficulty");
    values[":difficulty"] = fields.difficulty;
  }

  let out;
  try {
    out = await ctx.ddb.send(
      new UpdateCommand({
        TableName: ctx.env.PROBLEM_TABLE,
        Key: { id },
        UpdateExpression: "SET " + sets.join(", "),
        ConditionExpression: "userId = :u",
        ExpressionAttributeValues: values,
        ExpressionAttributeNames:
          Object.keys(names).length > 0 ? names : undefined,
        ReturnValues: "ALL_NEW"
      })
    );
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "name" in err &&
      (err as { name?: string }).name === "ConditionalCheckFailedException"
    ) {
      throw new Error("NOT_FOUND_OR_FORBIDDEN");
    }
    throw err;
  }

  return ProblemSchema.parse(out?.Attributes);
}

export const updateProblemTool: ToolDefinition<UpdateProblemInput, Problem> = {
  name: "update_problem",
  description:
    "Update an existing Problem's tags, note, or difficulty. Owner-scoped.",
  inputSchema: UpdateProblemInput,
  outputSchema: ProblemSchema,
  execute: updateProblem,
  jsonSchema: zodToJsonSchema(UpdateProblemInput) as object
};

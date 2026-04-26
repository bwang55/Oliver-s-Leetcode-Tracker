import { describe, it, expect, vi, beforeEach } from "vitest";
import { ZodError } from "zod";
import { updateProblem } from "../update-problem.js";
import type { ToolContext } from "../_types.js";

function makeCtx(sendImpl: (cmd: any) => any): {
  ctx: ToolContext;
  send: ReturnType<typeof vi.fn>;
} {
  const send = vi.fn(sendImpl);
  const ctx = {
    userId: "user-1",
    ddb: { send } as any,
    s3: {} as any,
    openai: {} as any,
    env: {
      PROBLEM_TABLE: "Problem",
      USER_TABLE: "User",
      RATELIMIT_TABLE: "RateLimit",
      AI_LOGS_BUCKET: "ai-logs",
      EXPORTS_BUCKET: "exports",
      OPENAI_MODEL_EXTRACTION: "x",
      OPENAI_MODEL_REASONING: "x",
      OPENAI_MODEL_INTENT: "x",
      AI_DAILY_RATE_LIMIT: 100,
      MCP_TOOL_DAILY_LIMIT: 100
    }
  } as ToolContext;
  return { ctx, send };
}

const validProblem = {
  id: "p1",
  userId: "user-1",
  number: 1,
  title: "Two Sum",
  difficulty: "EASY" as const,
  tags: ["array", "hash-map"],
  solvedAt: "2026-04-25T00:00:00.000Z",
  description: "desc",
  constraints: [],
  solutions: { python: "def f(): pass" },
  note: "",
  createdAt: "2026-04-25T00:00:00.000Z",
  updatedAt: "2026-04-25T00:00:00.000Z"
};

describe("update_problem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("success: returns parsed Problem; UpdateExpression includes tags and updatedAt", async () => {
    const { ctx, send } = makeCtx(async () => ({
      Attributes: { ...validProblem, tags: ["graph"], note: "hello" }
    }));

    const result = await updateProblem(ctx, {
      id: "p1",
      fields: { tags: ["graph"], note: "hello" }
    });

    expect(result.tags).toEqual(["graph"]);
    expect(result.note).toBe("hello");

    expect(send).toHaveBeenCalledTimes(1);
    const cmd = send.mock.calls[0][0];
    const input = cmd.input ?? cmd;
    expect(input.UpdateExpression).toMatch(/tags = :tags/);
    expect(input.UpdateExpression).toMatch(/updatedAt = :updatedAt/);
    expect(input.ConditionExpression).toBe("userId = :u");
    expect(input.ExpressionAttributeValues[":tags"]).toEqual(["graph"]);
    expect(input.ExpressionAttributeValues[":u"]).toBe("user-1");
    expect(typeof input.ExpressionAttributeValues[":updatedAt"]).toBe("string");
    expect(input.ReturnValues).toBe("ALL_NEW");
    expect(input.TableName).toBe("Problem");
    expect(input.Key).toEqual({ id: "p1" });
  });

  it("ownership rejection: ConditionalCheckFailedException -> NOT_FOUND_OR_FORBIDDEN", async () => {
    const { ctx } = makeCtx(async () => {
      const err: any = new Error("conditional check failed");
      err.name = "ConditionalCheckFailedException";
      throw err;
    });

    await expect(
      updateProblem(ctx, { id: "p1", fields: { note: "x" } })
    ).rejects.toThrow(/NOT_FOUND_OR_FORBIDDEN/);
  });

  it("field validation: empty fields object rejected by zod", async () => {
    const { ctx, send } = makeCtx(async () => ({ Attributes: validProblem }));

    await expect(
      updateProblem(ctx, { id: "p1", fields: {} } as any)
    ).rejects.toBeInstanceOf(ZodError);
    expect(send).not.toHaveBeenCalled();
  });

  it("partial update: only note provided; tags/difficulty NOT in expression", async () => {
    const { ctx, send } = makeCtx(async () => ({
      Attributes: { ...validProblem, note: "only-note" }
    }));

    await updateProblem(ctx, { id: "p1", fields: { note: "only-note" } });

    const cmd = send.mock.calls[0][0];
    const input = cmd.input ?? cmd;
    expect(input.UpdateExpression).toMatch(/:note/);
    expect(input.UpdateExpression).not.toMatch(/tags/);
    expect(input.UpdateExpression).not.toMatch(/difficulty/);
    expect(input.ExpressionAttributeValues[":note"]).toBe("only-note");
    expect(input.ExpressionAttributeValues[":tags"]).toBeUndefined();
    expect(input.ExpressionAttributeValues[":difficulty"]).toBeUndefined();
    // note is reserved -> needs ExpressionAttributeNames
    expect(input.ExpressionAttributeNames).toBeDefined();
  });
});

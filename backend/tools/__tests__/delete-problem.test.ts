import { describe, it, expect, vi, beforeEach } from "vitest";
import { deleteProblem } from "../delete-problem.js";
import type { ToolContext } from "../_types.js";

function makeCtx(sendImpl: (cmd: any) => any): ToolContext {
  return {
    userId: "user-123",
    ddb: { send: vi.fn(sendImpl) } as any,
    s3: {} as any,
    openai: {} as any,
    env: {
      PROBLEM_TABLE: "Problem",
      USER_TABLE: "User",
      RATELIMIT_TABLE: "RateLimit",
      AI_LOGS_BUCKET: "ai-logs",
      EXPORTS_BUCKET: "exports",
      OPENAI_MODEL_EXTRACTION: "gpt-4o-mini",
      OPENAI_MODEL_REASONING: "gpt-4o",
      OPENAI_MODEL_INTENT: "gpt-4o-mini",
      AI_DAILY_RATE_LIMIT: 100,
      MCP_TOOL_DAILY_LIMIT: 1000
    }
  };
}

describe("deleteProblem", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns deletedId on success", async () => {
    const ctx = makeCtx(async () => ({}));
    const out = await deleteProblem(ctx, { id: "prob-1" });
    expect(out).toEqual({ deletedId: "prob-1" });
    expect(ctx.ddb.send).toHaveBeenCalledTimes(1);

    const cmd = (ctx.ddb.send as any).mock.calls[0][0];
    expect(cmd.input.TableName).toBe("Problem");
    expect(cmd.input.Key).toEqual({ id: "prob-1" });
    expect(cmd.input.ConditionExpression).toBe("userId = :u");
    expect(cmd.input.ExpressionAttributeValues).toEqual({ ":u": "user-123" });
  });

  it("throws NOT_FOUND_OR_FORBIDDEN on ConditionalCheckFailedException", async () => {
    const ctx = makeCtx(async () => {
      const e: any = new Error("conditional check failed");
      e.name = "ConditionalCheckFailedException";
      throw e;
    });
    await expect(deleteProblem(ctx, { id: "prob-1" })).rejects.toThrow(/NOT_FOUND_OR_FORBIDDEN/);
  });

  it("rethrows other errors", async () => {
    const ctx = makeCtx(async () => {
      throw new Error("boom");
    });
    await expect(deleteProblem(ctx, { id: "prob-1" })).rejects.toThrow(/boom/);
  });

  it("rejects empty id via zod", async () => {
    const ctx = makeCtx(async () => ({}));
    await expect(deleteProblem(ctx, { id: "" } as any)).rejects.toThrow();
    expect(ctx.ddb.send).not.toHaveBeenCalled();
  });
});

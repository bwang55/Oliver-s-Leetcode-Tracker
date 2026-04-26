import { describe, it, expect, vi, beforeEach } from "vitest";
import { getProblem } from "../get-problem.js";
import type { ToolContext, Problem } from "../_types.js";

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

const sampleProblem: Problem = {
  id: "prob-1",
  userId: "user-123",
  number: 1,
  title: "Two Sum",
  difficulty: "EASY",
  tags: ["array", "hash-table"],
  solvedAt: "2026-04-25T10:00:00.000Z",
  description: null,
  constraints: null,
  solutions: null,
  note: null
};

describe("getProblem", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns parsed Problem on hit", async () => {
    const ctx = makeCtx(async () => ({ Item: sampleProblem }));
    const out = await getProblem(ctx, { id: "prob-1" });
    expect(out).toEqual(sampleProblem);
    expect(ctx.ddb.send).toHaveBeenCalledTimes(1);

    const cmd = (ctx.ddb.send as any).mock.calls[0][0];
    expect(cmd.input.TableName).toBe("Problem");
    expect(cmd.input.Key).toEqual({ id: "prob-1" });
  });

  it("throws NOT_FOUND when DDB returns no Item", async () => {
    const ctx = makeCtx(async () => ({}));
    await expect(getProblem(ctx, { id: "prob-1" })).rejects.toThrow(/NOT_FOUND/);
  });

  it("throws NOT_FOUND when item belongs to a different user", async () => {
    const ctx = makeCtx(async () => ({
      Item: { ...sampleProblem, userId: "other-user" }
    }));
    await expect(getProblem(ctx, { id: "prob-1" })).rejects.toThrow(/NOT_FOUND/);
  });

  it("rejects empty id via zod", async () => {
    const ctx = makeCtx(async () => ({}));
    await expect(getProblem(ctx, { id: "" } as any)).rejects.toThrow();
    expect(ctx.ddb.send).not.toHaveBeenCalled();
  });
});

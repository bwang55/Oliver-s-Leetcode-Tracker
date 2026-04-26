import { describe, it, expect, vi, beforeEach } from "vitest";
import { explainProblem } from "../explain-problem.js";
import type { ToolContext, Problem } from "../_types.js";

function makeCtx(opts: { problem?: any; openaiResponse?: string }): ToolContext {
  const ddbSend = vi.fn(async () => ({
    Item: opts.problem === undefined ? sampleProblem : opts.problem
  }));
  const openaiCreate = vi.fn(async () => ({
    choices: [{ message: { content: opts.openaiResponse ?? "### Explanation\n\nThis is a tutorial." } }]
  }));
  return {
    userId: "user-123",
    ddb: { send: ddbSend } as any,
    s3: {} as any,
    openai: { chat: { completions: { create: openaiCreate } } } as any,
    env: {
      PROBLEM_TABLE: "Problem",
      USER_TABLE: "User",
      RATELIMIT_TABLE: "RateLimit",
      AI_LOGS_BUCKET: "ai-logs",
      EXPORTS_BUCKET: "exports",
      OPENAI_MODEL_EXTRACTION: "gpt-x-mini",
      OPENAI_MODEL_REASONING: "gpt-x",
      OPENAI_MODEL_INTENT: "gpt-x-mini",
      AI_DAILY_RATE_LIMIT: 100,
      MCP_TOOL_DAILY_LIMIT: 1000
    }
  };
}

const sampleProblem: Problem = {
  id: "prob-1",
  userId: "user-123",
  number: 5,
  title: "Longest Palindromic Substring",
  difficulty: "MEDIUM",
  tags: ["string", "dp"],
  solvedAt: "2026-04-25T10:00:00.000Z",
  description: "Given a string s, return the longest palindromic substring in s.",
  constraints: ["1 <= s.length <= 1000"],
  solutions: { python: "def longestPalindrome(s):\n    pass", cpp: "", java: "" },
  note: null
};

describe("explainProblem", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns structured explanation when problem is owned", async () => {
    const ctx = makeCtx({ openaiResponse: "### Approach\n\nUse expand-around-center." });
    const out = await explainProblem(ctx, { id: "prob-1" });
    expect(out.problemNumber).toBe(5);
    expect(out.problemTitle).toBe("Longest Palindromic Substring");
    expect(out.difficulty).toBe("MEDIUM");
    expect(out.explanation).toContain("Approach");
    expect((ctx.openai.chat.completions.create as any).mock.calls.length).toBe(1);
  });

  it("includes user solution in the prompt when present", async () => {
    const ctx = makeCtx({});
    await explainProblem(ctx, { id: "prob-1" });
    const promptCall = (ctx.openai.chat.completions.create as any).mock.calls[0][0];
    const userMsg = promptCall.messages.find((m: any) => m.role === "user").content;
    expect(userMsg).toContain("def longestPalindrome");
  });

  it("rejects with NOT_FOUND when problem is missing", async () => {
    const ctx = makeCtx({ problem: null });
    await expect(explainProblem(ctx, { id: "missing" })).rejects.toThrow("NOT_FOUND");
  });

  it("rejects with NOT_FOUND when problem belongs to another user", async () => {
    const ctx = makeCtx({ problem: { ...sampleProblem, userId: "someone-else" } });
    await expect(explainProblem(ctx, { id: "prob-1" })).rejects.toThrow("NOT_FOUND");
  });

  it("rejects when LLM returns empty content", async () => {
    const ctx = makeCtx({ openaiResponse: "" });
    await expect(explainProblem(ctx, { id: "prob-1" })).rejects.toThrow("EMPTY_EXPLANATION");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { addCommentsToCode } from "../add-comments-to-code.js";
import type { ToolContext, Problem } from "../_types.js";

function makeCtx(opts: {
  problem?: any;
  openaiResponse?: string;
}): { ctx: ToolContext; ddbSend: any; openaiCreate: any } {
  const ddbSend = vi.fn(async (cmd: any) => {
    // First call is GetCommand (returns problem); second is UpdateCommand (returns void).
    if (cmd?.input?.UpdateExpression) return {};
    return { Item: opts.problem === undefined ? sampleProblem : opts.problem };
  });
  const openaiCreate = vi.fn(async () => ({
    choices: [{ message: { content: opts.openaiResponse ?? "# commented version\nx = 1  # init" } }]
  }));
  const ctx: ToolContext = {
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
  return { ctx, ddbSend, openaiCreate };
}

const sampleProblem: Problem = {
  id: "prob-1",
  userId: "user-123",
  number: 5,
  title: "Longest Palindromic Substring",
  difficulty: "MEDIUM",
  tags: ["string", "dp"],
  solvedAt: "2026-04-25T10:00:00.000Z",
  description: "Given a string s, return the longest palindromic substring.",
  constraints: ["1 <= s.length <= 1000"],
  solutions: {
    python: "def longestPalindrome(s):\n    return s",
    cpp: "",
    java: ""
  },
  note: null
};

describe("addCommentsToCode", () => {
  beforeEach(() => vi.clearAllMocks());

  it("adds comments and writes the result back to the problem row", async () => {
    const { ctx, ddbSend } = makeCtx({
      openaiResponse: "# expand-around-center\ndef longestPalindrome(s):\n    return s  # naive"
    });
    const out = await addCommentsToCode(ctx, { id: "prob-1", language: "python" });
    expect(out.problemNumber).toBe(5);
    expect(out.commentedCode).toContain("expand-around-center");
    expect(out.written).toBe(true);

    // 1 Get + 1 Update DDB call
    expect(ddbSend.mock.calls.length).toBe(2);
    const updateCmd = ddbSend.mock.calls[1][0];
    expect(updateCmd.input.UpdateExpression).toBe("SET solutions = :s");
    expect(updateCmd.input.ExpressionAttributeValues[":s"].python).toContain("expand-around-center");
    // Other languages should be preserved (empty strings here).
    expect(updateCmd.input.ExpressionAttributeValues[":s"].cpp).toBe("");
  });

  it("strips a leading code fence from LLM output before saving", async () => {
    const fenced = "```python\n# annotated\ndef foo(): return 1\n```";
    const { ctx, ddbSend } = makeCtx({ openaiResponse: fenced });
    const out = await addCommentsToCode(ctx, { id: "prob-1", language: "python" });
    expect(out.commentedCode.startsWith("```")).toBe(false);
    expect(out.commentedCode).toContain("# annotated");
    const updateCmd = ddbSend.mock.calls[1][0];
    expect(updateCmd.input.ExpressionAttributeValues[":s"].python.startsWith("```")).toBe(false);
  });

  it("rejects when language has no solution to comment on", async () => {
    const { ctx } = makeCtx({});
    await expect(addCommentsToCode(ctx, { id: "prob-1", language: "java" }))
      .rejects.toThrow(/NO_SOLUTION_FOR_LANGUAGE/);
  });

  it("rejects with NOT_FOUND on owner mismatch", async () => {
    const { ctx } = makeCtx({ problem: { ...sampleProblem, userId: "someone-else" } });
    await expect(addCommentsToCode(ctx, { id: "prob-1", language: "python" }))
      .rejects.toThrow("NOT_FOUND");
  });

  it("rejects when LLM returns empty output", async () => {
    const { ctx } = makeCtx({ openaiResponse: "" });
    await expect(addCommentsToCode(ctx, { id: "prob-1", language: "python" }))
      .rejects.toThrow("EMPTY_COMMENT_OUTPUT");
  });
});

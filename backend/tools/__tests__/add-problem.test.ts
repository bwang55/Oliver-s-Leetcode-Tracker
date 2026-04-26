import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ToolContext } from "../_types.js";

describe("addProblem tool", () => {
  let ctx: ToolContext;
  let ddbSend: any;
  let s3Send: any;
  let openaiCreate: any;

  beforeEach(() => {
    ddbSend = vi.fn();
    s3Send = vi.fn().mockResolvedValue({});
    openaiCreate = vi.fn();
    ctx = {
      userId: "user-1",
      ddb: { send: ddbSend } as any,
      s3: { send: s3Send } as any,
      openai: { chat: { completions: { create: openaiCreate } } } as any,
      env: {
        PROBLEM_TABLE: "P", USER_TABLE: "U", RATELIMIT_TABLE: "R",
        AI_LOGS_BUCKET: "ai", EXPORTS_BUCKET: "ex",
        OPENAI_MODEL_EXTRACTION: "gpt-5",
        OPENAI_MODEL_REASONING: "gpt-5",
        OPENAI_MODEL_INTENT: "gpt-5-mini",
        AI_DAILY_RATE_LIMIT: 50,
        MCP_TOOL_DAILY_LIMIT: 200
      }
    };
  });

  it("rejects with RATE_LIMIT_EXCEEDED when daily cap reached", async () => {
    ddbSend.mockRejectedValueOnce(Object.assign(new Error("over"), { name: "ConditionalCheckFailedException" }));
    const { addProblem } = await import("../add-problem.js");
    await expect(addProblem(ctx, { solutionText: "def two_sum(): pass" })).rejects.toThrow(/RATE_LIMIT_EXCEEDED/);
  });

  it("routes the solution into the language slot returned by the model", async () => {
    ddbSend
      .mockResolvedValueOnce({}) // rate limit update
      .mockResolvedValueOnce({}); // PutItem
    openaiCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{
            id: "call_1",
            type: "function",
            function: {
              name: "record_extraction",
              arguments: JSON.stringify({
                number: 1, title: "Two Sum", difficulty: "EASY",
                tags: ["array"], description: "find two indices", constraints: [],
                language: "cpp", confidence: "high"
              })
            }
          }]
        },
        finish_reason: "tool_calls"
      }]
    });
    const { addProblem } = await import("../add-problem.js");
    const result = await addProblem(ctx, { solutionText: "vector<int> twoSum() { return {}; }" });
    expect(result.solutions?.cpp).toBe("vector<int> twoSum() { return {}; }");
    expect(result.solutions?.python).toBe("");
    expect(result.title).toBe("Two Sum");
    expect(result.userId).toBe("user-1");
  });

  it("rolls back the rate limit increment on OpenAI 5xx", async () => {
    ddbSend
      .mockResolvedValueOnce({}) // rate limit increment
      .mockResolvedValueOnce({}); // rollback decrement
    openaiCreate.mockRejectedValueOnce(Object.assign(new Error("server error"), { status: 500 }));
    const { addProblem } = await import("../add-problem.js");
    await expect(addProblem(ctx, { solutionText: "valid solution code here" })).rejects.toThrow(/AI_SERVICE_UNAVAILABLE/);
    expect(ddbSend).toHaveBeenCalledTimes(2);
    const decrementCall = ddbSend.mock.calls[1][0];
    expect(decrementCall.input.UpdateExpression).toContain(":neg");
  });

  it("rejects AI_INVALID_RESPONSE when tool_calls is missing or malformed", async () => {
    ddbSend.mockResolvedValueOnce({}); // rate limit ok
    openaiCreate.mockResolvedValueOnce({
      choices: [{ message: { role: "assistant", content: "I cannot determine the problem", tool_calls: null }, finish_reason: "stop" }]
    });
    const { addProblem } = await import("../add-problem.js");
    await expect(addProblem(ctx, { solutionText: "valid solution code here for testing" })).rejects.toThrow(/AI_INVALID_RESPONSE/);
  });
});

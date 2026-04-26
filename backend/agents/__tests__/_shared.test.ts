import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import type { ToolContext } from "../../tools/_types.js";

vi.mock("../../tools/index.js", () => ({
  toolByName: vi.fn()
}));

import { toolByName } from "../../tools/index.js";
import { runAgent, type AgentEvent } from "../_shared.js";

describe("runAgent", () => {
  let ctx: ToolContext;
  let openaiCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();
    openaiCreate = vi.fn();
    ctx = {
      userId: "user-1",
      ddb: {} as any,
      s3: {} as any,
      openai: { chat: { completions: { create: openaiCreate } } } as any,
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
  });

  async function collect(stream: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
    const events: AgentEvent[] = [];
    for await (const ev of stream) events.push(ev);
    return events;
  }

  function makeStubTool(name: string, opts: { execute?: (input: any) => any | Promise<any>; throwError?: string } = {}) {
    return {
      name,
      description: `desc for ${name}`,
      inputSchema: z.any(),
      outputSchema: z.any(),
      jsonSchema: { type: "object", properties: {} },
      execute: opts.throwError
        ? vi.fn(async () => { throw new Error(opts.throwError!); })
        : vi.fn(async (_ctx: any, input: any) => (opts.execute ? opts.execute(input) : { ok: true }))
    };
  }

  it("yields thinking + done when no tool calls (single-turn)", async () => {
    openaiCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "Hello!", tool_calls: null }, finish_reason: "stop" }]
    });
    const events = await collect(
      runAgent(ctx, {
        name: "test",
        systemPrompt: "sys",
        allowedTools: [],
        model: "gpt-5",
        history: [],
        userMessage: "hi"
      })
    );
    expect(events.map((e) => e.type)).toEqual(["thinking", "done"]);
    expect((events[0] as any).delta).toBe("Hello!");
    expect((events[0] as any).agent).toBe("test");
    expect((events[1] as any).finalMessage).toBe("Hello!");
  });

  it("yields tool_call, tool_result, then done after second turn", async () => {
    const stub = makeStubTool("list_problems", { execute: () => ({ items: [] }) });
    (toolByName as any).mockReturnValue(stub);

    openaiCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              { id: "call_1", type: "function", function: { name: "list_problems", arguments: "{}" } }
            ]
          },
          finish_reason: "tool_calls"
        }
      ]
    });
    openaiCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "Here's your list", tool_calls: null }, finish_reason: "stop" }]
    });

    const events = await collect(
      runAgent(ctx, {
        name: "curator",
        systemPrompt: "sys",
        allowedTools: ["list_problems"],
        model: "gpt-5",
        history: [],
        userMessage: "list"
      })
    );

    expect(events.map((e) => e.type)).toEqual(["tool_call", "tool_result", "thinking", "done"]);
    expect((events[0] as any).tool).toBe("list_problems");
    expect((events[0] as any).id).toBe("call_1");
    expect((events[0] as any).args).toEqual({});
    expect((events[1] as any).result).toEqual({ items: [] });
    expect((events[1] as any).error).toBeUndefined();
    expect(typeof (events[1] as any).durationMs).toBe("number");
    expect((events[3] as any).finalMessage).toBe("Here's your list");
    expect(stub.execute).toHaveBeenCalledTimes(1);
  });

  it("propagates tool execution error as tool_result.error and continues", async () => {
    const stub = makeStubTool("list_problems", { throwError: "boom" });
    (toolByName as any).mockReturnValue(stub);

    openaiCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              { id: "call_err", type: "function", function: { name: "list_problems", arguments: "{}" } }
            ]
          },
          finish_reason: "tool_calls"
        }
      ]
    });
    openaiCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "recovered", tool_calls: null }, finish_reason: "stop" }]
    });

    const events = await collect(
      runAgent(ctx, {
        name: "curator",
        systemPrompt: "sys",
        allowedTools: ["list_problems"],
        model: "gpt-5",
        history: [],
        userMessage: "list"
      })
    );

    expect(events.map((e) => e.type)).toEqual(["tool_call", "tool_result", "thinking", "done"]);
    expect((events[1] as any).error).toBe("boom");
    expect((events[1] as any).result).toBeNull();
    expect((events[3] as any).finalMessage).toBe("recovered");

    // The second openai call should include a tool message with the error payload
    const secondCallMessages = openaiCreate.mock.calls[1][0].messages;
    const toolMsg = secondCallMessages.find((m: any) => m.role === "tool");
    expect(toolMsg).toBeDefined();
    expect(toolMsg.tool_call_id).toBe("call_err");
    expect(JSON.parse(toolMsg.content)).toEqual({ error: "boom" });
  });

  it("throws MAX_TOOL_CALLS_EXCEEDED after 10 iterations of tool calls", async () => {
    const stub = makeStubTool("list_problems", { execute: () => ({ items: [] }) });
    (toolByName as any).mockReturnValue(stub);

    // Always return a tool_call, never a stop
    openaiCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              { id: "loop", type: "function", function: { name: "list_problems", arguments: "{}" } }
            ]
          },
          finish_reason: "tool_calls"
        }
      ]
    });

    await expect(
      (async () => {
        for await (const _ev of runAgent(ctx, {
          name: "curator",
          systemPrompt: "sys",
          allowedTools: ["list_problems"],
          model: "gpt-5",
          history: [],
          userMessage: "loop"
        })) {
          // drain
        }
      })()
    ).rejects.toThrow(/MAX_TOOL_CALLS_EXCEEDED/);

    expect(openaiCreate).toHaveBeenCalledTimes(10);
  });

  it("filters tools to allowed subset when calling openai", async () => {
    const stub = makeStubTool("list_problems");
    (toolByName as any).mockImplementation((n: string) => {
      if (n === "list_problems") return stub;
      throw new Error(`Unknown tool: ${n}`);
    });

    openaiCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "done", tool_calls: null }, finish_reason: "stop" }]
    });

    await collect(
      runAgent(ctx, {
        name: "curator",
        systemPrompt: "sys",
        allowedTools: ["list_problems"],
        model: "gpt-5",
        history: [],
        userMessage: "hi"
      })
    );

    expect(openaiCreate).toHaveBeenCalledTimes(1);
    const callArgs = openaiCreate.mock.calls[0][0];
    expect(callArgs.tools).toHaveLength(1);
    expect(callArgs.tools[0].type).toBe("function");
    expect(callArgs.tools[0].function.name).toBe("list_problems");
    expect(callArgs.model).toBe("gpt-5");
    // System prompt + user message should be in messages
    expect(callArgs.messages[0]).toEqual({ role: "system", content: "sys" });
    expect(callArgs.messages[callArgs.messages.length - 1]).toEqual({ role: "user", content: "hi" });
  });
});

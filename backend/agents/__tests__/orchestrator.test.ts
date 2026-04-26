import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ToolContext } from "../../tools/_types.js";
import type { AgentEvent } from "../_shared.js";

// Mock sub-agents to be observable async generators
vi.mock("../curator.js", () => ({
  runCurator: vi.fn(async function*() { yield { type: "done", finalMessage: "curator-done" } as const; })
}));
vi.mock("../analyst.js", () => ({
  runAnalyst: vi.fn(async function*() { yield { type: "done", finalMessage: "analyst-done" } as const; })
}));
vi.mock("../planner.js", () => ({
  runPlanner: vi.fn(async function*() { yield { type: "done", finalMessage: "planner-done" } as const; })
}));

import { runCurator } from "../curator.js";
import { runAnalyst } from "../analyst.js";
import { runPlanner } from "../planner.js";
import { runOrchestrator } from "../orchestrator.js";

describe("orchestrator", () => {
  let ctx: ToolContext;
  let openaiCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Re-install async-generator implementations after clearing call history.
    (runCurator as any).mockImplementation(async function*() { yield { type: "done", finalMessage: "curator-done" } as const; });
    (runAnalyst as any).mockImplementation(async function*() { yield { type: "done", finalMessage: "analyst-done" } as const; });
    (runPlanner as any).mockImplementation(async function*() { yield { type: "done", finalMessage: "planner-done" } as const; });
    openaiCreate = vi.fn();
    ctx = {
      userId: "user-1",
      ddb: {} as any,
      s3: {} as any,
      openai: { chat: { completions: { create: openaiCreate } } } as any,
      env: { OPENAI_MODEL_INTENT: "gpt-5-mini" } as any
    };
  });

  async function collect(stream: AsyncIterable<any>): Promise<any[]> {
    const events: any[] = [];
    for await (const ev of stream) events.push(ev);
    return events;
  }

  function classifierReturns(content: string) {
    openaiCreate.mockResolvedValueOnce({
      choices: [{ message: { content }, finish_reason: "stop" }]
    });
  }

  it("routes 'curator' classification to runCurator", async () => {
    classifierReturns("curator");
    const events = await collect(runOrchestrator(ctx, [], "I just did Two Sum"));
    expect((runCurator as any)).toHaveBeenCalledTimes(1);
    expect((runAnalyst as any)).not.toHaveBeenCalled();
    expect((runPlanner as any)).not.toHaveBeenCalled();
    expect(events[0]).toMatchObject({ type: "route", route: "curator" });
  });

  it("routes 'analyst' to runAnalyst", async () => {
    classifierReturns("analyst");
    const events = await collect(runOrchestrator(ctx, [], "How am I doing?"));
    expect((runAnalyst as any)).toHaveBeenCalledTimes(1);
    expect((runCurator as any)).not.toHaveBeenCalled();
    expect((runPlanner as any)).not.toHaveBeenCalled();
    expect(events[0]).toMatchObject({ type: "route", route: "analyst" });
  });

  it("routes 'planner' to runPlanner", async () => {
    classifierReturns("planner");
    const events = await collect(runOrchestrator(ctx, [], "What should I do next?"));
    expect((runPlanner as any)).toHaveBeenCalledTimes(1);
    expect(events[0]).toMatchObject({ type: "route", route: "planner" });
  });

  it("routes 'multi:analyst-then-planner' through both agents in order", async () => {
    classifierReturns("multi:analyst-then-planner");
    const events = await collect(runOrchestrator(ctx, [], "analyze my weak areas and make a plan"));
    expect((runAnalyst as any)).toHaveBeenCalledTimes(1);
    expect((runPlanner as any)).toHaveBeenCalledTimes(1);
    // Planner's userMessage should reference the analyst's finalMessage
    const plannerCall = (runPlanner as any).mock.calls[0];
    const augmentedMessage = plannerCall[2];
    expect(augmentedMessage).toContain("analyst-done");
    expect(augmentedMessage).toContain("analyze my weak areas and make a plan");
    expect(events[0]).toMatchObject({ type: "route", route: "multi:analyst-then-planner" });
  });

  it("falls back to 'analyst' when classification is empty/garbage", async () => {
    classifierReturns("???");
    const events = await collect(runOrchestrator(ctx, [], "ambiguous"));
    expect((runAnalyst as any)).toHaveBeenCalledTimes(1);
    expect(events[0]).toMatchObject({ type: "route", route: "analyst" });
  });

  it("includes recent history in the classifier's user prompt", async () => {
    classifierReturns("planner");
    await collect(runOrchestrator(ctx, [
      { role: "user", content: "earlier message" },
      { role: "assistant", content: "earlier response" }
    ], "what's next"));
    const call = openaiCreate.mock.calls[0][0];
    expect(call.messages[1].content).toContain("earlier message");
    expect(call.messages[1].content).toContain("what's next");
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { dailySummary } from "../daily-summary.js";
import type { ToolContext } from "../_types.js";

function makeCtx(sendImpl: (cmd: any) => any): ToolContext {
  return {
    userId: "user-1",
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

const makeItem = (
  id: string,
  number: number,
  title: string,
  tags: string[],
  difficulty: "EASY" | "MEDIUM" | "HARD",
  solvedAt: string
) => ({
  id,
  userId: "user-1",
  number,
  title,
  difficulty,
  tags,
  solvedAt,
  description: "Long description that should not appear in output",
  constraints: ["1 <= n <= 1000"],
  solutions: { javascript: "function() { /* very long solution */ }" },
  note: "private note"
});

describe("dailySummary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("empty day — count 0 with 'No problems' summary", async () => {
    const ctx = makeCtx(async () => ({ Items: [] }));
    const out = await dailySummary(ctx, { date: "2026-04-25" });
    expect(out.count).toBe(0);
    expect(out.problems).toEqual([]);
    expect(out.tagsCovered).toEqual({});
    expect(out.summary).toContain("No problems");
    expect(out.summary).toContain("2026-04-25");
    expect(out.date).toBe("2026-04-25");
  });

  it("busy day — summary includes count + tags + difficulty; problems are brief view only", async () => {
    const items = [
      makeItem("p1", 1, "Two Sum", ["array", "hash-map"], "EASY", "2026-04-25T01:00:00.000Z"),
      makeItem("p2", 2, "Add Two Numbers", ["linked-list"], "MEDIUM", "2026-04-25T05:00:00.000Z"),
      makeItem(
        "p3",
        3,
        "Longest Substring",
        ["string", "hash-map"],
        "MEDIUM",
        "2026-04-25T20:00:00.000Z"
      )
    ];
    const ctx = makeCtx(async () => ({ Items: items }));

    const out = await dailySummary(ctx, { date: "2026-04-25" });

    expect(out.count).toBe(3);
    expect(out.date).toBe("2026-04-25");

    expect(out.summary).toContain("3 problems");
    expect(out.summary).toContain("2026-04-25");
    expect(out.summary).toContain("1 EASY");
    expect(out.summary).toContain("2 MEDIUM");
    expect(out.summary).toContain("hash-map (2)");

    expect(out.tagsCovered).toEqual({
      array: 1,
      "hash-map": 2,
      "linked-list": 1,
      string: 1
    });

    expect(out.problems).toHaveLength(3);
    for (const p of out.problems) {
      expect(p).toHaveProperty("id");
      expect(p).toHaveProperty("number");
      expect(p).toHaveProperty("title");
      expect(p).toHaveProperty("difficulty");
      expect(p).toHaveProperty("solvedAt");
      expect(p).not.toHaveProperty("description");
      expect(p).not.toHaveProperty("solutions");
      expect(p).not.toHaveProperty("constraints");
      expect(p).not.toHaveProperty("note");
      expect(p).not.toHaveProperty("tags");
    }
    expect(out.problems[0]).toEqual({
      id: "p1",
      number: 1,
      title: "Two Sum",
      difficulty: "EASY",
      solvedAt: "2026-04-25T01:00:00.000Z"
    });
  });

  it("default date = today — query bounds match today's UTC midnight", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-25T13:37:42.000Z"));
    try {
      const ctx = makeCtx(async () => ({ Items: [] }));
      await dailySummary(ctx, {});

      const cmd = (ctx.ddb.send as any).mock.calls[0][0];
      expect(cmd.input.TableName).toBe("Problem");
      expect(cmd.input.IndexName).toBe("byUserAndDate");
      expect(cmd.input.KeyConditionExpression).toBe(
        "userId = :u AND solvedAt BETWEEN :from AND :to"
      );
      expect(cmd.input.ExpressionAttributeValues).toEqual({
        ":u": "user-1",
        ":from": "2026-04-25T00:00:00.000Z",
        ":to": "2026-04-26T00:00:00.000Z"
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("specific date — query bounds match supplied day's UTC midnight", async () => {
    const ctx = makeCtx(async () => ({ Items: [] }));
    await dailySummary(ctx, { date: "2026-04-15" });

    const cmd = (ctx.ddb.send as any).mock.calls[0][0];
    expect(cmd.input.ExpressionAttributeValues).toEqual({
      ":u": "user-1",
      ":from": "2026-04-15T00:00:00.000Z",
      ":to": "2026-04-16T00:00:00.000Z"
    });
  });

  it("paginates through LastEvaluatedKey", async () => {
    const page1 = [
      makeItem("p1", 1, "A", ["array"], "EASY", "2026-04-25T01:00:00.000Z")
    ];
    const page2 = [
      makeItem("p2", 2, "B", ["dp"], "HARD", "2026-04-25T02:00:00.000Z")
    ];
    let call = 0;
    const ctx = makeCtx(async () => {
      call++;
      if (call === 1) return { Items: page1, LastEvaluatedKey: { id: "p1" } };
      return { Items: page2 };
    });

    const out = await dailySummary(ctx, { date: "2026-04-25" });
    expect(out.count).toBe(2);
    expect((ctx.ddb.send as any).mock.calls).toHaveLength(2);
    const secondCmd = (ctx.ddb.send as any).mock.calls[1][0];
    expect(secondCmd.input.ExclusiveStartKey).toEqual({ id: "p1" });
  });
});

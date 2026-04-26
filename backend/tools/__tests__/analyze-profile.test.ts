import { describe, it, expect, vi, beforeEach } from "vitest";
import { analyzeProfile } from "../analyze-profile.js";
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
  tags: string[],
  difficulty: "EASY" | "MEDIUM" | "HARD" = "MEDIUM",
  solvedAt = "2026-04-20T10:00:00.000Z"
) => ({
  id,
  userId: "user-1",
  number: 1,
  title: "T",
  difficulty,
  tags,
  solvedAt,
  description: null,
  constraints: null,
  solutions: null,
  note: null
});

const REFERENCE_TAGS = [
  "array","string","hash-map","two-pointer","sliding-window","binary-search",
  "dp","greedy","backtracking","tree","graph","bfs","dfs","heap","stack",
  "linked-list","sorting","bit-manipulation"
];

describe("analyzeProfile", () => {
  beforeEach(() => vi.clearAllMocks());

  it("empty dataset — zero counts, weakAreas = first 3 reference tags, strongAreas = []", async () => {
    const ctx = makeCtx(async () => ({ Items: [] }));
    const out = await analyzeProfile(ctx, { window: "all" });

    expect(out.totalProblems).toBe(0);
    expect(out.byTag).toEqual({});
    expect(out.byDifficulty).toEqual({ EASY: 0, MEDIUM: 0, HARD: 0 });
    // All reference tags tied at 0; sorting is stable so first 3 are the first 3 ref tags
    expect(out.weakAreas).toEqual(REFERENCE_TAGS.slice(0, 3));
    expect(out.strongAreas).toEqual([]);
  });

  it("small dataset (5 items) — counts tags + difficulties correctly", async () => {
    const items = [
      makeItem("p1", ["array", "dp"], "EASY"),
      makeItem("p2", ["array", "two-pointer"], "MEDIUM"),
      makeItem("p3", ["dp"], "MEDIUM"),
      makeItem("p4", ["graph", "bfs"], "HARD"),
      makeItem("p5", ["array"], "MEDIUM")
    ];
    const ctx = makeCtx(async () => ({ Items: items }));

    const out = await analyzeProfile(ctx, { window: "all" });

    expect(out.totalProblems).toBe(5);
    expect(out.byTag).toEqual({
      array: 3,
      dp: 2,
      "two-pointer": 1,
      graph: 1,
      bfs: 1
    });
    expect(out.byDifficulty).toEqual({ EASY: 1, MEDIUM: 3, HARD: 1 });
  });

  it("window=week — KeyConditionExpression uses solvedAt >= :from with ~7 days ago", async () => {
    const ctx = makeCtx(async () => ({ Items: [] }));
    const before = Date.now();
    await analyzeProfile(ctx, { window: "week" });
    const after = Date.now();

    const cmd = (ctx.ddb.send as any).mock.calls[0][0];
    expect(cmd.input.TableName).toBe("Problem");
    expect(cmd.input.IndexName).toBe("byUserAndDate");
    expect(cmd.input.KeyConditionExpression).toContain("solvedAt >= :from");
    expect(cmd.input.KeyConditionExpression).toContain("userId = :u");
    expect(cmd.input.ExpressionAttributeValues[":u"]).toBe("user-1");

    const fromMs = new Date(cmd.input.ExpressionAttributeValues[":from"]).getTime();
    const expectedMin = before - 7 * 86400000;
    const expectedMax = after - 7 * 86400000;
    // Should be in [expectedMin, expectedMax] — allow 1s tolerance.
    expect(fromMs).toBeGreaterThanOrEqual(expectedMin - 1000);
    expect(fromMs).toBeLessThanOrEqual(expectedMax + 1000);
  });

  it("window=all — :from is epoch ISO", async () => {
    const ctx = makeCtx(async () => ({ Items: [] }));
    await analyzeProfile(ctx, { window: "all" });
    const cmd = (ctx.ddb.send as any).mock.calls[0][0];
    expect(cmd.input.ExpressionAttributeValues[":from"]).toBe(new Date(0).toISOString());
  });

  it("strongAreas — top 3 tags by frequency", async () => {
    const items = [
      makeItem("p1", ["a"]),
      makeItem("p2", ["a"]),
      makeItem("p3", ["a"]),
      makeItem("p4", ["b"]),
      makeItem("p5", ["b"]),
      makeItem("p6", ["c"])
    ];
    const ctx = makeCtx(async () => ({ Items: items }));

    const out = await analyzeProfile(ctx, { window: "all" });
    expect(out.strongAreas).toEqual(["a", "b", "c"]);
  });

  it("paginates — combines items from multiple DDB pages", async () => {
    const page1 = [
      makeItem("p1", ["array"], "EASY"),
      makeItem("p2", ["dp"], "MEDIUM"),
      makeItem("p3", ["graph"], "HARD")
    ];
    const page2 = [
      makeItem("p4", ["array"], "MEDIUM"),
      makeItem("p5", ["tree"], "EASY")
    ];
    const lastKey = { id: "p3", userId: "user-1", solvedAt: "2026-04-20T10:00:00.000Z" };

    let call = 0;
    const ctx = makeCtx(async () => {
      call++;
      if (call === 1) return { Items: page1, LastEvaluatedKey: lastKey };
      return { Items: page2 };
    });

    const out = await analyzeProfile(ctx, { window: "all" });

    expect(ctx.ddb.send).toHaveBeenCalledTimes(2);
    expect(out.totalProblems).toBe(5);
    expect(out.byTag).toEqual({ array: 2, dp: 1, graph: 1, tree: 1 });
    expect(out.byDifficulty).toEqual({ EASY: 2, MEDIUM: 2, HARD: 1 });

    // Second call must pass ExclusiveStartKey from LastEvaluatedKey
    const secondCmd = (ctx.ddb.send as any).mock.calls[1][0];
    expect(secondCmd.input.ExclusiveStartKey).toEqual(lastKey);
  });
});

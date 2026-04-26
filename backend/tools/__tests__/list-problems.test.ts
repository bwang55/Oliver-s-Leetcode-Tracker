import { describe, it, expect, vi, beforeEach } from "vitest";
import { listProblems } from "../list-problems.js";
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
  solvedAt = "2026-04-20T10:00:00Z"
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

describe("listProblems", () => {
  beforeEach(() => vi.clearAllMocks());

  it("basic list, no filter — returns items + cursor when LastEvaluatedKey present", async () => {
    const items = [
      makeItem("p1", ["dp"], "MEDIUM", "2026-04-22T10:00:00Z"),
      makeItem("p2", ["graph"], "EASY", "2026-04-21T10:00:00Z"),
      makeItem("p3", ["array"], "HARD", "2026-04-20T10:00:00Z")
    ];
    const lastKey = { id: "p3", userId: "user-1", solvedAt: "2026-04-20T10:00:00Z" };
    const ctx = makeCtx(async () => ({ Items: items, LastEvaluatedKey: lastKey }));

    const out = await listProblems(ctx, {} as any);
    expect(out.items).toHaveLength(3);
    expect(out.items.map((i) => i.id)).toEqual(["p1", "p2", "p3"]);
    expect(out.cursor).toBe(encodeURIComponent(JSON.stringify(lastKey)));

    const cmd = (ctx.ddb.send as any).mock.calls[0][0];
    expect(cmd.input.TableName).toBe("Problem");
    expect(cmd.input.IndexName).toBe("byUserAndDate");
    expect(cmd.input.KeyConditionExpression).toBe("userId = :u");
    expect(cmd.input.ExpressionAttributeValues).toEqual({ ":u": "user-1" });
    expect(cmd.input.ScanIndexForward).toBe(false);
    expect(cmd.input.Limit).toBe(50);
    expect(cmd.input.ExclusiveStartKey).toBeUndefined();
  });

  it("last page — no cursor when LastEvaluatedKey absent", async () => {
    const items = [
      makeItem("p1", ["dp"]),
      makeItem("p2", ["graph"])
    ];
    const ctx = makeCtx(async () => ({ Items: items }));

    const out = await listProblems(ctx, {} as any);
    expect(out.items).toHaveLength(2);
    expect(out.cursor).toBeUndefined();
  });

  it("with cursor — decoded JSON passed as ExclusiveStartKey", async () => {
    const startKey = { id: "p99", userId: "user-1", solvedAt: "2026-04-15T10:00:00Z" };
    const cursor = encodeURIComponent(JSON.stringify(startKey));
    const ctx = makeCtx(async () => ({ Items: [] }));

    await listProblems(ctx, { cursor } as any);

    const cmd = (ctx.ddb.send as any).mock.calls[0][0];
    expect(cmd.input.ExclusiveStartKey).toEqual(startKey);
  });

  it("tag filter (post-query) — keeps items having any of the tags", async () => {
    const items = [
      makeItem("p1", ["dp", "array"]),
      makeItem("p2", ["graph"]),
      makeItem("p3", ["dp"]),
      makeItem("p4", ["tree"]),
      makeItem("p5", ["string", "dp"])
    ];
    const ctx = makeCtx(async () => ({ Items: items }));

    const out = await listProblems(ctx, { filter: { tags: ["dp"] } } as any);
    expect(out.items.map((i) => i.id)).toEqual(["p1", "p3", "p5"]);
  });

  it("difficulty filter — keeps only the matching difficulty", async () => {
    const items = [
      makeItem("p1", ["a"], "EASY"),
      makeItem("p2", ["a"], "MEDIUM"),
      makeItem("p3", ["a"], "HARD"),
      makeItem("p4", ["a"], "MEDIUM"),
      makeItem("p5", ["a"], "EASY")
    ];
    const ctx = makeCtx(async () => ({ Items: items }));

    const out = await listProblems(ctx, { filter: { difficulty: "MEDIUM" } } as any);
    expect(out.items.map((i) => i.id)).toEqual(["p2", "p4"]);
  });

  it("date range — KeyConditionExpression uses BETWEEN", async () => {
    const ctx = makeCtx(async () => ({ Items: [] }));
    await listProblems(ctx, {
      filter: {
        dateFrom: "2026-04-01T00:00:00Z",
        dateTo: "2026-04-30T23:59:59Z"
      }
    } as any);

    const cmd = (ctx.ddb.send as any).mock.calls[0][0];
    expect(cmd.input.KeyConditionExpression).toBe(
      "userId = :u AND solvedAt BETWEEN :from AND :to"
    );
    expect(cmd.input.ExpressionAttributeValues).toEqual({
      ":u": "user-1",
      ":from": "2026-04-01T00:00:00Z",
      ":to": "2026-04-30T23:59:59Z"
    });
  });

  it("limit clamping — zod rejects limit > 200", async () => {
    const ctx = makeCtx(async () => ({ Items: [] }));
    await expect(listProblems(ctx, { limit: 500 } as any)).rejects.toThrow();
    expect(ctx.ddb.send).not.toHaveBeenCalled();
  });
});

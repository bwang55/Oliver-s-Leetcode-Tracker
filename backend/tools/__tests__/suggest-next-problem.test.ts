import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { suggestNextProblem } from "../suggest-next-problem.js";
import type { ToolContext } from "../_types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const bank: Array<{
  number: number;
  title: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  tags: string[];
  url: string;
  prerequisiteTags: string[];
}> = JSON.parse(
  readFileSync(join(__dirname, "..", "data", "problem-bank.json"), "utf-8")
);

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

describe("suggestNextProblem", () => {
  beforeEach(() => vi.clearAllMocks());

  it("empty user history, no focus — returns a valid bank problem", async () => {
    const ctx = makeCtx(async () => ({ Items: [] }));
    const out = await suggestNextProblem(ctx, {});
    expect(out.suggestion.number).toBeGreaterThan(0);
    expect(typeof out.suggestion.title).toBe("string");
    expect(out.suggestion.title.length).toBeGreaterThan(0);
    expect(["EASY", "MEDIUM", "HARD"]).toContain(out.suggestion.difficulty);
    expect(Array.isArray(out.suggestion.tags)).toBe(true);
    expect(out.suggestion.url).toMatch(/^https?:\/\//);
    expect(out.rationale.length).toBeGreaterThan(0);
    // Should be one of the bank entries
    expect(bank.some((p) => p.number === out.suggestion.number)).toBe(true);
  });

  it("focus on 'graph', no graph problems done — picks a graph-tagged problem", async () => {
    const ctx = makeCtx(async () => ({ Items: [] }));
    const out = await suggestNextProblem(ctx, { focus: "graph" });
    expect(out.suggestion.tags).toContain("graph");
    expect(out.rationale).toMatch(/graph/);
  });

  it("all bank problems done — throws BANK_EXHAUSTED", async () => {
    const items = bank.map((p) => ({
      id: `p${p.number}`,
      userId: "user-1",
      number: p.number,
      title: p.title,
      difficulty: p.difficulty,
      tags: p.tags,
      solvedAt: "2026-04-20T10:00:00Z",
      description: null,
      constraints: null,
      solutions: null,
      note: null
    }));
    const ctx = makeCtx(async () => ({ Items: items }));
    await expect(suggestNextProblem(ctx, {})).rejects.toThrow(/BANK_EXHAUSTED/);
  });

  it("focus tag with no candidates — throws BANK_EXHAUSTED", async () => {
    const ctx = makeCtx(async () => ({ Items: [] }));
    await expect(
      suggestNextProblem(ctx, { focus: "nonexistent-tag" })
    ).rejects.toThrow(/BANK_EXHAUSTED|no candidates/);
  });

  it("excludes already-solved problems", async () => {
    // User has done #1 (Two Sum)
    const items = [
      {
        id: "p1",
        userId: "user-1",
        number: 1,
        title: "Two Sum",
        difficulty: "EASY",
        tags: ["array", "hash-map"],
        solvedAt: "2026-04-20T10:00:00Z",
        description: null,
        constraints: null,
        solutions: null,
        note: null
      }
    ];
    const ctx = makeCtx(async () => ({ Items: items }));
    const out = await suggestNextProblem(ctx, {});
    expect(out.suggestion.number).not.toBe(1);
  });

  it("paginates user history via LastEvaluatedKey", async () => {
    let call = 0;
    const ctx = makeCtx(async () => {
      call += 1;
      if (call === 1) {
        return {
          Items: [
            {
              id: "p1",
              userId: "user-1",
              number: 1,
              title: "Two Sum",
              difficulty: "EASY",
              tags: ["array", "hash-map"],
              solvedAt: "2026-04-20T10:00:00Z",
              description: null,
              constraints: null,
              solutions: null,
              note: null
            }
          ],
          LastEvaluatedKey: { id: "p1" }
        };
      }
      return { Items: [] };
    });
    const out = await suggestNextProblem(ctx, {});
    expect(out.suggestion.number).not.toBe(1);
    expect((ctx.ddb.send as any).mock.calls.length).toBe(2);
  });
});

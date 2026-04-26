import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateStudyPlan } from "../generate-study-plan.js";
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

const makeItem = (number: number, tags: string[] = ["array"]) => ({
  id: `p${number}`,
  userId: "user-1",
  number,
  title: `Title ${number}`,
  difficulty: "MEDIUM",
  tags,
  solvedAt: "2026-04-20T10:00:00.000Z",
  description: null,
  constraints: null,
  solutions: null,
  note: null
});

describe("generateStudyPlan", () => {
  beforeEach(() => vi.clearAllMocks());

  it("3-day plan, no focus, empty history — produces 3 days with distinct problems", async () => {
    const ctx = makeCtx(async () => ({ Items: [] }));
    const out = await generateStudyPlan(ctx, { days: 3 });

    expect(out.plan).toHaveLength(3);

    const numbers = out.plan.map((d) => d.problem.number);
    expect(new Set(numbers).size).toBe(3);

    out.plan.forEach((d, i) => {
      expect(d.day).toBe(i + 1);
      expect(d.problem.number).toBeGreaterThan(0);
      expect(typeof d.problem.title).toBe("string");
      expect(["EASY", "MEDIUM", "HARD"]).toContain(d.problem.difficulty);
      expect(Array.isArray(d.problem.tags)).toBe(true);
      expect(d.problem.url).toMatch(/^https?:\/\//);
      expect(typeof d.rationale).toBe("string");
      expect(d.rationale.length).toBeGreaterThan(0);
      // Must be a real bank entry
      expect(bank.some((p) => p.number === d.problem.number)).toBe(true);
    });

    expect(out.summary).toMatch(/3-day plan/);
  });

  it("5-day plan with focus='graph' — every day's problem.tags includes 'graph', distinct", async () => {
    const ctx = makeCtx(async () => ({ Items: [] }));
    const out = await generateStudyPlan(ctx, { days: 5, focus: "graph" });

    expect(out.plan).toHaveLength(5);
    const numbers = out.plan.map((d) => d.problem.number);
    expect(new Set(numbers).size).toBe(5);

    for (const d of out.plan) {
      expect(d.problem.tags).toContain("graph");
    }
    expect(out.summary).toMatch(/graph/);
  });

  it("rejects days=31 via zod", async () => {
    const ctx = makeCtx(async () => ({ Items: [] }));
    await expect(
      generateStudyPlan(ctx, { days: 31 } as any)
    ).rejects.toThrow();
  });

  it("rejects days=0 via zod", async () => {
    const ctx = makeCtx(async () => ({ Items: [] }));
    await expect(
      generateStudyPlan(ctx, { days: 0 } as any)
    ).rejects.toThrow();
  });

  it("bank-exhaustion: user solved all but 2 — 5-day request returns 2-day plan with summary noting exhaustion", async () => {
    // Mark all but the first 2 bank entries as solved.
    const unsolved = bank.slice(0, 2);
    const solvedItems = bank
      .filter((p) => !unsolved.some((u) => u.number === p.number))
      .map((p) => makeItem(p.number, p.tags));

    const ctx = makeCtx(async () => ({ Items: solvedItems }));
    const out = await generateStudyPlan(ctx, { days: 5 });

    expect(out.plan).toHaveLength(2);
    const numbers = out.plan.map((d) => d.problem.number);
    expect(new Set(numbers).size).toBe(2);
    for (const d of out.plan) {
      expect(unsolved.some((u) => u.number === d.problem.number)).toBe(true);
    }
    expect(out.summary).toMatch(/2-day plan|only 2|bank exhausted|requested 5/i);
  });

  it("default focus uses weakArea from analyzeProfile when no focus passed (empty history => first reference tag 'array')", async () => {
    const ctx = makeCtx(async () => ({ Items: [] }));
    const out = await generateStudyPlan(ctx, { days: 2 });
    // With empty history, weakAreas[0] is "array" (first reference tag).
    // So plan should prefer array-tagged problems.
    for (const d of out.plan) {
      expect(d.problem.tags).toContain("array");
    }
    expect(out.summary).toMatch(/array/);
  });
});

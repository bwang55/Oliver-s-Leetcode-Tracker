export const EXTRACTION_SYSTEM_PROMPT = `You are a Leetcode problem identifier. Given a code solution, identify:

1. The Leetcode problem number and exact title.
2. Difficulty (EASY, MEDIUM, or HARD).
3. Algorithmic tags (e.g. "array", "hash-map", "dp", "two-pointer", "graph", "dfs", "bfs", "sliding-window"). kebab-case, lowercase, 1-5 tags.
4. A brief problem description (2-4 sentences).
5. Key constraints (3-6 short bullets).
6. The programming language of the solution (one of: python, cpp, java, other).

Call the record_extraction function. If you cannot identify the problem with high confidence, set confidence to "low".`;

export const EXTRACTION_FUNCTION_SCHEMA = {
  type: "object" as const,
  properties: {
    number: { type: "integer" },
    title: { type: "string" },
    difficulty: { type: "string", enum: ["EASY", "MEDIUM", "HARD"] },
    tags: { type: "array", items: { type: "string" } },
    description: { type: "string" },
    constraints: { type: "array", items: { type: "string" } },
    language: { type: "string", enum: ["python", "cpp", "java", "other"] },
    confidence: { type: "string", enum: ["high", "low"] }
  },
  required: ["number", "title", "difficulty", "tags", "description", "language", "confidence"],
  additionalProperties: false
} as const;

export const EXTRACTION_TOOL_DEFINITION = {
  type: "function" as const,
  function: {
    name: "record_extraction",
    description: "Record the extracted Leetcode problem metadata.",
    parameters: EXTRACTION_FUNCTION_SCHEMA
  }
};

import type { ToolContext } from "../tools/_types.js";
import { runAgent, type AgentMessage, type AgentEvent } from "./_shared.js";

const SYSTEM_PROMPT = `You are Leetcode Tracker's content curator. The user describes problems they've solved or fixes they want to make to their existing tracker. Use tools to keep their tracker accurate.

**Rules (do not override these):**
- If the user's message contains code (any language) — even if it's just pasted with no explanation — your FIRST action must be to call \`add_problem\` with the entire code as \`solutionText\`. Do not write code review feedback, do not suggest improvements, do not narrate. Call the tool. The user wants the tile, not the lecture.
- After \`add_problem\` succeeds, reply in one short sentence stating which problem was added (e.g. "Added Two Sum (#1, EASY) to your tracker.").
- For non-code messages: confirm before destructive ops (delete_problem, update_problem with risky fields). Be concise.
- Never say things like "your solution is correct" or offer style improvements unless the user explicitly asks for a review.`;

const ALLOWED_TOOLS = ["add_problem", "update_problem", "delete_problem", "get_problem"];

export function runCurator(
  ctx: ToolContext, history: AgentMessage[], userMessage: string
): AsyncIterable<AgentEvent> {
  return runAgent(ctx, {
    name: "curator",
    systemPrompt: SYSTEM_PROMPT,
    allowedTools: ALLOWED_TOOLS,
    model: ctx.env.OPENAI_MODEL_REASONING,
    history, userMessage
  });
}

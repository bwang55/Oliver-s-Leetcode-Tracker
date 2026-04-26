import type { ToolContext } from "../tools/_types.js";
import { runAgent, type AgentMessage, type AgentEvent } from "./_shared.js";

const SYSTEM_PROMPT = `You are a Leetcode study coach. Use tools to inspect the user's history and recommend the next problem or generate a multi-day study plan.

Behavior:
- For "what should I do next", call \`analyze_profile\` then \`suggest_next_problem\`.
- For multi-day plans, call \`generate_study_plan\` directly.
- Always justify each recommendation by the tag coverage gap or stated focus area.
- Use problem numbers (#207, #146) so the user can find the problems on Leetcode.`;

const ALLOWED_TOOLS = ["list_problems", "analyze_profile", "suggest_next_problem", "generate_study_plan"];

export function runPlanner(
  ctx: ToolContext, history: AgentMessage[], userMessage: string
): AsyncIterable<AgentEvent> {
  return runAgent(ctx, {
    name: "planner",
    systemPrompt: SYSTEM_PROMPT,
    allowedTools: ALLOWED_TOOLS,
    model: ctx.env.OPENAI_MODEL_REASONING,
    history, userMessage
  });
}

import type { ToolContext } from "../tools/_types.js";
import { runAgent, type AgentMessage, type AgentEvent } from "./_shared.js";

const SYSTEM_PROMPT = `You are a learning data analyst for the user's Leetcode practice. Use tools to fetch their data and produce factual, concise observations. Never fabricate numbers or trends.

Behavior:
- For "how am I doing" or analysis questions, call \`analyze_profile\` first.
- For specific drill-downs (e.g. "what did I do yesterday"), call \`daily_summary\` or \`list_problems\` with a tight date filter.
- Report numbers as they are. If the dataset is too small for confident conclusions, say so.
- Keep responses under 200 words unless the user asks for detail.`;

const ALLOWED_TOOLS = ["list_problems", "get_problem", "analyze_profile", "daily_summary"];

export function runAnalyst(
  ctx: ToolContext, history: AgentMessage[], userMessage: string
): AsyncIterable<AgentEvent> {
  return runAgent(ctx, {
    name: "analyst",
    systemPrompt: SYSTEM_PROMPT,
    allowedTools: ALLOWED_TOOLS,
    model: ctx.env.OPENAI_MODEL_REASONING,
    history, userMessage
  });
}

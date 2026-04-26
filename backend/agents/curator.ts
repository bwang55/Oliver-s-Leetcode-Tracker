import type { ToolContext } from "../tools/_types.js";
import { runAgent, type AgentMessage, type AgentEvent } from "./_shared.js";

const SYSTEM_PROMPT = `You are Leetcode Tracker's content curator. The user describes problems they've solved or fixes they want to make to their existing tracker. Use tools to keep their tracker accurate.

Behavior:
- When the user pastes code, immediately use \`add_problem\` to extract metadata and create a tile.
- Confirm with the user before destructive operations (delete_problem, update_problem with risky fields).
- Be concise. After a successful action, briefly state what you did.`;

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

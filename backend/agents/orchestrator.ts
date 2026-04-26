import type { ToolContext } from "../tools/_types.js";
import { runCurator } from "./curator.js";
import { runAnalyst } from "./analyst.js";
import { runPlanner } from "./planner.js";
import type { AgentMessage, AgentEvent } from "./_shared.js";

type Route = "curator" | "analyst" | "planner" | "multi:analyst-then-planner";

const INTENT_SYSTEM_PROMPT = `You route user messages to exactly one agent. Reply with ONE word, no explanation, no code review, no quotes.

Routes:
- curator       — message contains code OR is about adding/updating/deleting problems in the tracker
- analyst       — questions about stats, history, or "how am I doing"
- planner       — "what should I do next", recommendations, multi-day study plans
- multi:analyst-then-planner — explicit combo of analysis + plan ("analyze X then plan Y")

The hard rule: **if the message contains a code block or function definition (def / class / function / public / void / fn / etc.) → reply "curator". No exceptions, even if the user just dumps code with no English text. Even if the code looks like a textbook solution and you'd love to give feedback. The curator agent will handle it.**

Examples:
User: I just did Two Sum: def twoSum(nums, target): seen={}; for i,n in enumerate(nums): ...
Reply: curator

User: \`\`\`python\\nclass Solution: def twoSum(self, nums, target): ...\\n\`\`\`
Reply: curator

User: How am I doing this week?
Reply: analyst

User: What should I tackle next?
Reply: planner

User: Analyze my weak areas and give me a 7-day plan
Reply: multi:analyst-then-planner

Reply with ONE word now.`;

async function classifyIntent(ctx: ToolContext, userMessage: string, history: AgentMessage[]): Promise<Route> {
  const recentHistory = history.slice(-4).map((m) => `${m.role}: ${typeof m.content === "string" ? m.content : "[tool calls]"}`).join("\n");
  const resp = await ctx.openai.chat.completions.create({
    model: ctx.env.OPENAI_MODEL_INTENT,
    max_completion_tokens: 50,
    messages: [
      { role: "system", content: INTENT_SYSTEM_PROMPT },
      { role: "user", content: `Recent history:\n${recentHistory}\n\nUser: ${userMessage}` }
    ]
  });
  const text = resp.choices[0]?.message?.content?.trim().toLowerCase() ?? "analyst";
  const valid: Route[] = ["curator", "analyst", "planner", "multi:analyst-then-planner"];
  // Check most-specific first (multi: substring contains "analyst" and "planner" too)
  if (text.includes("multi")) return "multi:analyst-then-planner";
  return valid.find((v) => text.includes(v)) ?? "analyst";
}

// Cheap deterministic check before paying for an LLM classifier call. If the
// message obviously contains code, we know the answer (curator) and skip the
// model. This is the model-disagreement safety net — in testing gpt-5-mini
// kept routing code-paste messages to analyst despite explicit instructions.
function obviouslyCode(s: string): boolean {
  return (
    /```[\w]*\n[\s\S]+?\n```/.test(s) ||
    /\b(def|class|function)\s+\w+\s*\(/.test(s) ||
    /\bpublic\s+(?:int|void|class|static)\s+\w+/.test(s) ||
    /#include\s*<\w+>/.test(s)
  );
}

export async function* runOrchestrator(
  ctx: ToolContext, history: AgentMessage[], userMessage: string
): AsyncIterable<AgentEvent | { type: "route"; route: Route; reason: string }> {
  let route: Route;
  let reason: string;
  if (obviouslyCode(userMessage)) {
    route = "curator";
    reason = "Code detected — routed to curator without classifier call";
  } else {
    route = await classifyIntent(ctx, userMessage, history);
    reason = "Classified by intent model";
  }
  yield { type: "route", route, reason };

  if (route === "curator") yield* runCurator(ctx, history, userMessage);
  else if (route === "analyst") yield* runAnalyst(ctx, history, userMessage);
  else if (route === "planner") yield* runPlanner(ctx, history, userMessage);
  else {
    // multi:analyst-then-planner
    let analystSummary = "";
    for await (const ev of runAnalyst(ctx, history, userMessage)) {
      yield ev;
      if (ev.type === "done") analystSummary = ev.finalMessage;
    }
    const augmented = `Based on the analyst's findings:\n\n${analystSummary}\n\nNow generate a plan for: ${userMessage}`;
    yield* runPlanner(ctx, history, augmented);
  }
}

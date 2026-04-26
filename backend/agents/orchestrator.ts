import type { ToolContext } from "../tools/_types.js";
import { runCurator } from "./curator.js";
import { runAnalyst } from "./analyst.js";
import { runPlanner } from "./planner.js";
import type { AgentMessage, AgentEvent } from "./_shared.js";

type Route = "curator" | "analyst" | "planner" | "multi:analyst-then-planner";

const INTENT_SYSTEM_PROMPT = `Classify the user's request into one of:
- curator: adding/updating/deleting problems in their tracker. **Any message that contains code (Python/C++/Java/JavaScript/etc., including pasted Leetcode solutions) MUST be classified as curator**, even if the user doesn't explicitly say "add this". The curator agent will add it to the tracker.
- analyst: questions about the user's stats, history, or progress over time. Pure analysis, no plan generation.
- planner: asking what problem to do next, multi-day study plans, recommendations.
- multi:analyst-then-planner: requests that combine analysis and planning (e.g. "analyze my weak areas and make a plan").

Return ONLY the route name (one of: curator, analyst, planner, multi:analyst-then-planner), nothing else.`;

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

export async function* runOrchestrator(
  ctx: ToolContext, history: AgentMessage[], userMessage: string
): AsyncIterable<AgentEvent | { type: "route"; route: Route; reason: string }> {
  const route = await classifyIntent(ctx, userMessage, history);
  yield { type: "route", route, reason: "Classified by intent model" };

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

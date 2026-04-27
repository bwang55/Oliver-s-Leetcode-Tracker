import type { ToolContext } from "../tools/_types.js";
import { runCurator } from "./curator.js";
import { runAnalyst } from "./analyst.js";
import { runPlanner } from "./planner.js";
import { runTutor } from "./tutor.js";
import type { AgentMessage, AgentEvent, PageContext } from "./_shared.js";

export type { PageContext } from "./_shared.js";

type Route = "curator" | "analyst" | "planner" | "tutor" | "multi:analyst-then-planner";

const INTENT_SYSTEM_PROMPT = `You route user messages to exactly one agent. Reply with ONE word, no explanation, no code review, no quotes.

Routes:
- curator       — message contains code (paste) OR is about adding/updating/deleting problems in the tracker
- analyst       — questions about stats, history, or "how am I doing"
- planner       — "what should I do next", recommendations, multi-day study plans
- tutor         — "explain this", "讲讲这题", "walk me through", "add comments to my code", "annotate", "加注释"
- multi:analyst-then-planner — explicit combo of analysis + plan ("analyze X then plan Y")

The hard rule for code: **if the message contains a code block or function definition (def / class / function / public / void / fn / etc.) AND looks like the user is submitting/sharing a solution they wrote → reply "curator". The user is logging that they solved it. Curator handles add/update/delete.**

But: **if the message asks for help understanding or annotating an EXISTING tracker entry (no fresh code paste) → reply "tutor".** "Explain #5", "讲讲这题", "add comments to my python" are all tutor.

Examples:
User: I just did Two Sum: def twoSum(nums, target): seen={}; for i,n in enumerate(nums): ...
Reply: curator

User: \`\`\`python\\nclass Solution: def twoSum(self, nums, target): ...\\n\`\`\`
Reply: curator

User: How am I doing this week?
Reply: analyst

User: What should I tackle next?
Reply: planner

User: 讲讲这道题
Reply: tutor

User: Can you explain Longest Palindromic Substring?
Reply: tutor

User: Add comments to my python solution
Reply: tutor

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
  const valid: Route[] = ["curator", "analyst", "planner", "tutor", "multi:analyst-then-planner"];
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
  ctx: ToolContext,
  history: AgentMessage[],
  userMessage: string,
  pageContext?: PageContext
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

  // pageContext is passed through so agents can inject it into their system
  // prompts (much more reliable than embedding it in the user message — see
  // buildPageContextHint in _shared.ts).
  if (route === "curator") yield* runCurator(ctx, history, userMessage, pageContext);
  else if (route === "analyst") yield* runAnalyst(ctx, history, userMessage);
  else if (route === "planner") yield* runPlanner(ctx, history, userMessage);
  else if (route === "tutor") yield* runTutor(ctx, history, userMessage, pageContext);
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

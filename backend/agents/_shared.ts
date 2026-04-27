import type { ToolContext } from "../tools/_types.js";
import { toolByName } from "../tools/index.js";

export interface AgentMessage {
  role: "user" | "assistant" | "tool" | "system";
  content: string | Array<any> | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

export type AgentEvent =
  | { type: "thinking"; agent: string; delta: string }
  | { type: "tool_call"; id: string; tool: string; args: any }
  | { type: "tool_result"; id: string; result: any; durationMs: number; error?: string }
  | { type: "done"; finalMessage: string };

const MAX_TOOL_CALLS = 10;
const AGENT_TIMEOUT_MS = 30_000;

export interface PageContext {
  /** The internal Problem.id (UUID) the user is currently viewing in the UI, if any. */
  problemId?: string;
  problemNumber?: number;
  problemTitle?: string;
}

/** Format a PageContext into a system-level instruction block. */
export function buildPageContextHint(pc?: PageContext): string | undefined {
  if (!pc?.problemId) return undefined;
  const labelParts = [
    pc.problemNumber ? `#${pc.problemNumber}` : null,
    pc.problemTitle || null
  ].filter(Boolean);
  const label = labelParts.length > 0 ? ` (${labelParts.join(" ")})` : "";
  return [
    `**CURRENT PAGE CONTEXT**: The user is currently viewing problem id="${pc.problemId}"${label} in the UI.`,
    "",
    "When the user says \"this problem\", \"this\", \"these\", \"讲讲这题\", \"give me\", \"explain\", \"add comments\", or any pronoun-based reference WITHOUT naming a problem — they mean the problem with the id above.",
    "",
    `Use \`id: "${pc.problemId}"\` directly when calling \`explain_problem\`, \`add_comments_to_code\`, \`get_problem\`, \`update_problem\`, or \`delete_problem\`. Do NOT call \`find_problem\` first — you already have the id.`
  ].join("\n");
}

export async function* runAgent(
  ctx: ToolContext,
  args: {
    name: string;
    systemPrompt: string;
    allowedTools: string[];
    model: string;
    history: AgentMessage[];
    userMessage: string;
    /** Force a specific tool on the FIRST iteration only. Subsequent iterations use "auto". */
    forceToolFirstTurn?: string;
    /** Optional system-level context (e.g. "user is currently viewing problem id=...").
     *  Appended to systemPrompt so the model treats it as authoritative — much more
     *  reliable than embedding the same info in the user message. */
    contextHint?: string;
  }
): AsyncIterable<AgentEvent> {
  const start = Date.now();
  const tools = args.allowedTools.map((n) => {
    const t = toolByName(n);
    return {
      type: "function" as const,
      function: { name: t.name, description: t.description, parameters: t.jsonSchema }
    };
  });

  const fullSystemPrompt = args.contextHint
    ? `${args.systemPrompt}\n\n---\n\n${args.contextHint}`
    : args.systemPrompt;

  const messages: any[] = [
    { role: "system", content: fullSystemPrompt },
    ...args.history.map((m) => ({ role: m.role, content: m.content, tool_calls: m.tool_calls, tool_call_id: m.tool_call_id })),
    { role: "user", content: args.userMessage }
  ];

  let iter = 0;
  while (iter < MAX_TOOL_CALLS) {
    if (Date.now() - start > AGENT_TIMEOUT_MS) throw new Error("AGENT_TIMEOUT");
    iter++;

    // Only force the tool on the very first turn. After that, let the model decide
    // (it might want to text-respond after the forced tool result lands).
    const toolChoice = (iter === 1 && args.forceToolFirstTurn)
      ? { type: "function" as const, function: { name: args.forceToolFirstTurn } }
      : undefined;

    const resp = await ctx.openai.chat.completions.create({
      model: args.model,
      max_completion_tokens: 2048,
      tools: tools as any,
      messages,
      ...(toolChoice ? { tool_choice: toolChoice } : {})
    });

    const message = resp.choices[0].message;
    const finishReason = resp.choices[0].finish_reason;

    if (message.content) {
      yield { type: "thinking", agent: args.name, delta: message.content };
    }

    const toolCalls = message.tool_calls ?? [];
    if (toolCalls.length === 0 || finishReason === "stop") {
      const finalMessage = message.content ?? "";
      yield { type: "done", finalMessage };
      return;
    }

    // Persist the assistant turn (with its tool_calls) before adding tool results
    messages.push({
      role: "assistant",
      content: message.content,
      tool_calls: toolCalls
    });

    for (const tc of toolCalls) {
      const args_obj = (() => { try { return JSON.parse(tc.function.arguments); } catch { return {}; } })();
      yield { type: "tool_call", id: tc.id, tool: tc.function.name, args: args_obj };
      const t = toolByName(tc.function.name);
      const tStart = Date.now();
      try {
        const validated = t.inputSchema.parse(args_obj);
        const result = await t.execute(ctx, validated);
        const durationMs = Date.now() - tStart;
        yield { type: "tool_result", id: tc.id, result, durationMs };
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result)
        });
      } catch (err: any) {
        const durationMs = Date.now() - tStart;
        yield { type: "tool_result", id: tc.id, result: null, durationMs, error: err.message };
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({ error: err.message })
        });
      }
    }
  }

  throw new Error("MAX_TOOL_CALLS_EXCEEDED");
}

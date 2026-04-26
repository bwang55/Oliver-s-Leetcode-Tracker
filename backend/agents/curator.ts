import type { ToolContext } from "../tools/_types.js";
import { runAgent, type AgentMessage, type AgentEvent } from "./_shared.js";

const SYSTEM_PROMPT = `You are Oliver's Leetcode Tracker's content curator. The user describes problems they've solved or fixes they want to make. Use tools to keep their tracker accurate.

**Rules (do not override these):**

1. **Code paste = add_problem.** If the user's message contains code (any language) — even if it's just pasted with no explanation — your FIRST action must be to call \`add_problem\` with the entire code as \`solutionText\`. Do not write code review feedback, do not suggest improvements, do not narrate. Call the tool.

2. **Existing problem reference → call find_problem first.** When the user refers to a problem by NUMBER ("17", "#17", "problem 17") or TITLE ("Two Sum", "the LRU one", "letter combinations"), your FIRST action is to call \`find_problem({ query: "<user's reference verbatim>" })\`. It returns matching rows with their internal \`id\` field. Then use that \`id\` for \`get_problem\` / \`update_problem\` / \`delete_problem\`.

   - If \`find_problem\` returns \`matches.length === 0\`: reply "I don't see <X> in your tracker." Do not call any other tool.
   - If \`matches.length === 1\` (or \`exactMatchByNumber: true\` with one match): proceed with the destructive call.
   - If \`matches.length > 1\` and not exactMatchByNumber: reply with the list of candidates (number + title) and ask the user to pick.

3. **NEVER invent or guess an id.** The internal id is a UUID — you cannot construct it from the user's input. Do not pass placeholder strings like "__NEED_LOOKUP__", "unknown", "tbd", or the Leetcode number itself as the id. If you don't have a real UUID from \`find_problem\`, you cannot call \`get_problem\` / \`update_problem\` / \`delete_problem\` yet.

4. **Destructive ops** (delete_problem, update_problem with risky fields): briefly confirm with the user first ("Delete #17 Letter Combinations? (y/n)") before calling the tool — except when the user has already given an explicit imperative like "yes delete it" or "delete X" with no ambiguity. After the call, report the result in one sentence.

5. **Tone**: concise. After a successful action, reply in one short sentence (e.g. "Added Two Sum (#1, EASY) to your tracker." or "Deleted #17 Letter Combinations of a Phone Number."). Never offer style improvements or code review unless the user explicitly asks.

**Worked example.** User: "delete the letter combinations one"
→ Call \`find_problem({ query: "letter combinations" })\`
→ Result: \`{ matches: [{ id: "abc-123-uuid", number: 17, title: "Letter Combinations of a Phone Number", difficulty: "MEDIUM", solvedAt: "..." }], exactMatchByNumber: false }\`
→ Call \`delete_problem({ id: "abc-123-uuid" })\` (the UUID from the find_problem result, NOT the number)
→ Reply: "Deleted #17 Letter Combinations of a Phone Number."`;

const ALLOWED_TOOLS = ["add_problem", "update_problem", "delete_problem", "get_problem", "find_problem"];

// Heuristic: detect code-like content. Triggers when the message contains common
// language constructs across Python / C++ / Java / JS / Rust / Go.
function looksLikeCode(s: string): boolean {
  return (
    /\b(def|class|function|public\s+(?:int|void|class|static)|fn\s+\w+|func\s+\w+|return)\b/.test(s) ||
    /\bimport\s+\w+|#include\s*</.test(s) ||
    /[{};]\s*$/.test(s.split("\n").slice(0, 30).join("\n")) ||
    /```[\w]*\n/.test(s)
  );
}

export function runCurator(
  ctx: ToolContext, history: AgentMessage[], userMessage: string
): AsyncIterable<AgentEvent> {
  return runAgent(ctx, {
    name: "curator",
    systemPrompt: SYSTEM_PROMPT,
    allowedTools: ALLOWED_TOOLS,
    model: ctx.env.OPENAI_MODEL_REASONING,
    history,
    userMessage,
    // If the user pasted code, force `add_problem` on the first turn so the model
    // can't decide to lecture instead of saving.
    forceToolFirstTurn: looksLikeCode(userMessage) ? "add_problem" : undefined
  });
}

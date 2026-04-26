# Leetcode Tracker — Backend Design v2 (Multi-Agent + MCP)

**Date:** 2026-04-25
**Status:** Approved, ready for implementation plan
**Supersedes:** [v1 spec](./2026-04-25-backend-design.md) (kept for reference)
**Stack:** AWS Amplify Gen 2, Cognito, AppSync, DynamoDB, Lambda, S3, API Gateway HTTP API (for MCP transport), OpenAI API (chat completions + function calling), MCP TypeScript SDK

> **LLM provider note:** all internal LLM calls (extraction, agent reasoning, intent classification) use OpenAI. The MCP server is provider-agnostic — it speaks the open MCP protocol, so external clients like Claude Desktop, Cursor, Codex CLI, or any other MCP-aware client can still connect. The "demo Claude Desktop talking to my MCP server" story is unaffected by our internal LLM choice.

---

## 1. Why this is a v2

v1 was a single-call AI extraction (paste solution → get problem record). v2 reframes the project as a **multi-agent system over a shared MCP tool layer**, motivated by these explicit goals:

- **Portfolio / interview value:** the architecture itself is a story. "Tools + agents + MCP" is the 2025-2026 vocabulary recruiters listen for.
- **Demo factor:** opening Claude Desktop in front of an interviewer and operating the live tracker through the candidate's MCP server is a stronger demo than walking through screenshots.
- **Engineering cleanliness:** the same tool implementations serve the public MCP server, the in-app agent layer, and direct GraphQL calls. One source of truth.

**Non-goals** stay the same as v1: no MFA, no social features, no multi-region, no mobile native.

---

## 2. Architecture Overview

```
                ┌──────────────────────────────┐    ┌──────────────────────────┐
                │  PWA (Vite + amplify-js)     │    │  External MCP clients    │
                │  · home / detail pages       │    │  · Claude Desktop        │
                │  · chat drawer (Curator/     │    │  · claude.ai             │
                │     Analyst/Planner)         │    │  · any MCP-aware client  │
                └──────┬───────────────┬───────┘    └────────────┬─────────────┘
                       │ GraphQL/SSE   │                          │ MCP over HTTP/SSE
                       │               │                          │ (OAuth 2.1 via Cognito)
        ┌──────────────▼───┐   ┌───────▼────────┐   ┌─────────────▼────────────┐
        │ AppSync          │   │ Orchestrator   │   │  MCP Server (Lambda)      │
        │ (CRUD via @model)│   │ Lambda         │   │  via API GW HTTP API      │
        │ Cognito JWT auth │   │ + SSE stream   │   │  · OAuth resource server  │
        └──────────────────┘   └───┬─┬─┬────────┘   │  · ~9 tool endpoints      │
                                   │ │ │             └────────────┬─────────────┘
                                   │ │ │                          │
                                   ▼ ▼ ▼                          │
                       ┌─────────────────────┐                    │
                       │  Curator / Analyst /│                    │
                       │  Planner agents     │  agents call ──────┤
                       │  (OpenAI SDK +      │  shared lib        │
                       │  function calling)  │  directly          │
                       └──────────┬──────────┘                    │
                                  │                               │
                                  └────────────┬──────────────────┘
                                               │
                                               ▼
                                  ┌─────────────────────────────┐
                                  │ Shared core tools layer      │
                                  │ (TypeScript lib in backend/  │
                                  │ tools/, ~9 pure functions)   │
                                  └─────┬──────────┬──────┬──────┘
                                        │          │      │
                                        ▼          ▼      ▼
                                  ┌──────────┐ ┌──────┐ ┌──────────────┐
                                  │ DynamoDB │ │  S3  │ │  OpenAI API  │
                                  │ User /   │ │      │ │ (only for    │
                                  │ Problem /│ │      │ │  add_problem)│
                                  │ RateLimit│ │      │ └──────────────┘
                                  └──────────┘ └──────┘
```

### Three layers, top to bottom

1. **Surfaces** — PWA, external MCP clients. They talk to the system through one of three channels (AppSync for raw CRUD, Orchestrator HTTP-SSE endpoint for chat, MCP HTTP for external tool use).
2. **Agent layer** — Curator / Analyst / Planner (each a system prompt + a tool subset) and an Orchestrator (routes intents, chains agents). All four are standard OpenAI Chat Completions calls with `tools:[{type:"function",...}]`; the tool *implementations* come from the shared lib (not via MCP — internal calls stay direct, MCP overhead is for the public surface).
3. **Tools layer** — `backend/tools/`, pure TypeScript functions + their JSON schemas. Used by:
   - The agent layer (imported as functions, wired into `tool_use` calls).
   - The MCP server (each tool wrapped as an MCP tool definition exposed via Streamable HTTP).
   - Future direct GraphQL custom mutations if we want them.

### Repository layout

All backend code lives under `backend/` for clean separation from `frontend/`:

```
leetcode/
├── frontend/              (Vite SPA, see §7)
├── backend/               (all backend code lives here)
│   ├── tools/             (shared tool layer, §3)
│   ├── agents/            (Curator, Analyst, Planner, Orchestrator)
│   ├── mcp-server/        (MCP Lambda + transport)
│   ├── auth/              (Cognito config + post-confirm trigger)
│   ├── data/              (Amplify Data schema)
│   ├── functions/         (custom mutation Lambdas)
│   ├── storage/           (S3 buckets)
│   └── monitoring/        (CloudWatch alarms)
├── amplify/
│   └── backend.ts         (1-line CLI shim, see below)
└── docs/
```

`amplify/backend.ts` is a one-file shim required by the `npx ampx` CLI (Amplify Gen 2 hard-codes the `amplify/` path as its entry point):

```ts
// amplify/backend.ts
import { defineBackend } from "@aws-amplify/backend";
import { auth } from "../backend/auth/resource";
import { data } from "../backend/data/resource";
import { extractProblem } from "../backend/functions/extract-problem/resource";
// ...other resources
export const backend = defineBackend({ auth, data, extractProblem, /* ... */ });
```

Everything else — TypeScript imports, IDE navigation, code review — happens against `backend/`.

### Why shared lib instead of "agents call MCP server"?

Tempting and cleaner-looking, but adds a network hop for every internal tool call (Lambda → MCP Lambda → DynamoDB instead of Lambda → DynamoDB). For a portfolio demo we want *fast* in-app responses. The shared lib pattern keeps internal calls direct while the MCP server is just another consumer of the same lib. **One implementation, two transports.**

---

## 3. The Tool Catalog

All tools take an authenticated user context (`userId`, derived from JWT or MCP OAuth token) and return typed results. Schemas are shared TypeScript types and serialized to JSON Schema for both the OpenAI SDK `tools:[{type:"function",...}]` array and the MCP server's tool registry.

| Tool | Purpose | LLM inside? | Used by |
|---|---|---|---|
| `add_problem(solutionText, language?)` | Extract metadata via OpenAI, persist new Problem | **Yes** (OpenAI call inside the tool) | Curator, MCP |
| `update_problem(id, fields)` | Update tags/note/difficulty | No | Curator, MCP |
| `delete_problem(id)` | Delete a Problem | No | Curator, MCP |
| `list_problems(filter, limit, cursor)` | Paginated list with tag/difficulty/date filters | No | Analyst, Planner, MCP |
| `get_problem(id)` | Fetch a single Problem with full solutions | No | Analyst, MCP |
| `analyze_profile(window)` | Compute stats (tag distribution, difficulty mix, weak areas) over a date window | No (deterministic) | Analyst, MCP |
| `suggest_next_problem(focus?)` | Pick a problem from the curated bank that covers a weak area | No | Planner, MCP |
| `generate_study_plan(days, focus?)` | Combine `analyze_profile` + repeated `suggest_next_problem` to produce N-day plan | No | Planner, MCP |
| `daily_summary(date?)` | Recap of one day's activity | No | Analyst, MCP |

**Key property:** in the *tools* layer, only `add_problem` calls OpenAI. Eight of nine tools are pure data ops. This means:
- Tools are unit-testable without mocking LLMs (except `add_problem`).
- The agents do the LLM-thinking; the tools do the data-carrying.

The *agent* layer is a separate OpenAI-cost source: every agent invocation calls the reasoning model (default `gpt-5`, env-var configurable) one or more turns, and the orchestrator calls a smaller model (default `gpt-5-mini`) once for intent classification. So total monthly AI cost = (`add_problem` token cost) + (agent reasoning token cost) + (orchestrator classifier cost). Rate limiting (§9) constrains the first two; the third is negligible. **Prompt caching** is automatic in OpenAI (no API field — repeated prompt prefixes >1024 tokens are cached server-side), which keeps repeat calls cheap without explicit config.

### Tool schema example

```ts
// backend/tools/list-problems.ts
import { z } from "zod";

export const ListProblemsInput = z.object({
  filter: z.object({
    tags: z.array(z.string()).optional(),
    difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional()
  }).optional(),
  limit: z.number().int().min(1).max(200).default(50),
  cursor: z.string().optional()
});

export const ListProblemsOutput = z.object({
  items: z.array(ProblemSchema),
  cursor: z.string().optional()
});

export async function listProblems(
  ctx: ToolContext,
  input: z.infer<typeof ListProblemsInput>
): Promise<z.infer<typeof ListProblemsOutput>> {
  // Query byUserAndDate GSI scoped to ctx.userId, post-filter, return cursor.
}

// JSON Schema generated for OpenAI function calling / MCP via zod-to-json-schema
export const listProblemsTool = {
  name: "list_problems",
  description: "List the authenticated user's problems with optional tag/difficulty/date filters. Returns paginated results.",
  input_schema: zodToJsonSchema(ListProblemsInput)
};
```

Every tool follows this shape. `ToolContext` holds `userId` and the shared AWS clients.

---

## 4. Agents

Each agent is a Lambda function that:
1. Receives a user message + chat history.
2. Loops: call OpenAI Chat Completions with system prompt + relevant tool subset (as `tools: [{type:"function", function:{...}}]`), execute any `tool_calls` returned, feed results back as `{role: "tool", tool_call_id, content}` messages. Standard OpenAI function-calling loop.
3. Streams progress via SSE back to the orchestrator (which streams to the PWA chat drawer).

### 4.1 Curator

- **System prompt:** "You are Leetcode Tracker's content curator. The user describes problems they've solved or fixes they want to make. Use tools to keep their tracker accurate. Be concise. Confirm what you're about to do for destructive operations (delete, update). When the user pastes code, use `add_problem`."
- **Tools:** `add_problem`, `update_problem`, `delete_problem`, `get_problem` (for confirmations).
- **Model:** `gpt-5` (env-var configurable; falls back to `gpt-4o` if not available).
- **Typical interaction:** "I just did Two Sum" → Curator calls `add_problem`, returns the new tile.

### 4.2 Analyst

- **System prompt:** "You are a learning data analyst for the user's Leetcode practice. Use tools to fetch their data and produce factual, concise observations. Don't fabricate. When asked for advice, give it briefly — the Planner agent handles plan generation."
- **Tools:** `list_problems`, `get_problem`, `analyze_profile`, `daily_summary`.
- **Model:** `gpt-5` (env-var configurable; falls back to `gpt-4o` if not available).
- **Typical interaction:** "How am I doing this month?" → Analyst calls `analyze_profile(window: month)`, narrates the result.

### 4.3 Planner

- **System prompt:** "You are a Leetcode study coach. Use tools to inspect the user's current state and recommend the next problem or generate a multi-day plan. Be specific — name problem numbers, justify each pick by tag coverage."
- **Tools:** `list_problems`, `analyze_profile`, `suggest_next_problem`, `generate_study_plan`.
- **Model:** `gpt-5` (env-var configurable; falls back to `gpt-4o` if not available).
- **Typical interaction:** "Make me a 7-day plan focused on graphs" → Planner calls `analyze_profile`, then `generate_study_plan(days: 7, focus: "graph")`, formats the result.

### 4.4 Orchestrator

The orchestrator is *not* a fourth agent in the same shape — it's a thin router. Two responsibilities:

1. **Intent classification.** A single small-model call (default `gpt-5-mini`, env-var configurable) with the user's message + recent chat history, returning structured output: `{ agent: "curator" | "analyst" | "planner" | "multi", reason: string }`.

2. **Multi-agent chaining.** When intent classifier returns `"multi"` (e.g. "analyze my weak spots and then make me a plan"), the orchestrator runs Analyst first, captures its summary, then injects it into Planner's context as a system message ("The user's analyst session concluded: ..."). Streams both agents' progress to the client.

**No autonomous agent-to-agent talk.** The orchestrator is a dumb pipe; agents don't call each other. This is intentional — keeps the system explainable, debuggable, and avoids a class of failure modes where agents loop. (We can revisit if a real use case demands it.)

### Why three agents, not one big agent with all tools?

Two reasons:

1. **System-prompt specialization.** Each agent's prompt is tuned for its job. Curator says "confirm before destructive ops", Analyst says "don't fabricate", Planner says "justify with tag coverage". A single prompt holding all three concerns is longer, more conflicting, and degrades model adherence.
2. **Story-telling.** "I have three specialized agents that share a tool layer" is a richer narrative than "I have one agent with nine tools."

For a system this size, both reasons are real but mild. The architecture is justified more by (2) than (1) — that's an honest tradeoff worth knowing.

---

## 5. MCP Server

### 5.1 Transport

**Streamable HTTP** (the MCP spec's recommended transport as of 2025-Q3, replaces legacy SSE-only). Implemented as a single **Lambda Function URL** with `InvokeMode: RESPONSE_STREAM`, fronted by CloudFront for HTTPS + custom domain. The Lambda uses `@modelcontextprotocol/sdk-typescript`'s `StreamableHTTPServerTransport`.

We pick Lambda Function URL over API Gateway HTTP API because API GW HTTP APIs buffer responses (no streaming), while Function URLs natively support chunked-transfer streaming, which the MCP transport spec uses for server→client messages and notifications. Our current tool set is one-shot request/response, but choosing the streaming-capable transport now leaves room for tools that yield partial results (e.g. `generate_study_plan` could stream day-by-day) without re-architecting later.

### 5.2 Authentication: OAuth 2.1 with PKCE

MCP spec mandates OAuth 2.1 with Dynamic Client Registration (DCR) and PKCE. Cognito User Pools support OAuth 2.0 + PKCE but not DCR. Bridge:

- **Authorization Server:** Cognito User Pool's hosted UI domain (`https://<pool>.auth.<region>.amazoncognito.com`).
- **Static OAuth client** registered on the User Pool, named `mcp-clients`, no client secret (public client), redirect URIs include `https://claude.ai/api/mcp/auth_callback` and the Claude Desktop scheme.
- **A small `/mcp/.well-known/oauth-authorization-server` endpoint** on the MCP Lambda that returns RFC 8414 metadata with the `registration_endpoint` pointing at our own DCR shim Lambda. The shim accepts `RegisterClient` requests, validates them minimally (any registered Cognito user can register), and returns the static client ID. This is a known pattern for Cognito + MCP and acceptable for a portfolio project.
- **Token validation:** the MCP Lambda verifies incoming `Authorization: Bearer <jwt>` headers against Cognito's JWKS (standard JWT verification). Extracts `sub` → `userId`.

This is more involved than v1's pure Cognito + AppSync flow. It's worth it for the demo: an interviewer types "claude desktop add MCP server" and a real OAuth flow opens in their browser.

### 5.3 Tool registration

The MCP Lambda imports each tool from `backend/tools/` and registers it with the SDK:

```ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { addProblem, addProblemTool, AddProblemInput } from "../tools/add-problem.js";
// ...other tool imports

const server = new Server({ name: "lc-tracker", version: "1.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [addProblemTool, updateProblemTool, /* ... */]
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const ctx = { userId: req.params._meta?.userId };
  const dispatch = {
    add_problem: async (i) => addProblem(ctx, AddProblemInput.parse(i)),
    // ...
  };
  return { content: [{ type: "text", text: JSON.stringify(await dispatch[req.params.name](req.params.arguments)) }] };
});
```

Each user's `userId` is taken from their JWT before dispatch; tools never see other users' data because tool implementations always filter by `ctx.userId`.

### 5.4 Rate limiting

MCP server reuses the same `RateLimit` table as the v1 design. Each tool call counts against `aiCallCount` *only if* the tool itself triggers an OpenAI call (i.e. only `add_problem`). All other tools are free-of-AI and don't increment, but they do increment a separate `mcpToolCount` field (default cap 200/user/day) to bound abuse against the MCP surface. Agent reasoning calls in the PWA path are bounded by the §9 chat-turn cap rather than this counter.

### 5.5 Public discoverability

We document the MCP server URL at `https://lc-tracker.example.com/.well-known/mcp.json` (and in our README). Any user with a Cognito account can connect their MCP client by adding our URL.

---

## 6. Data Model Updates

v1 schema (`User`, `Problem`, `RateLimit`) stays. Add:

```graphql
type ChatSession
  @model
  @auth(rules: [{ allow: owner, ownerField: "userId" }])
{
  id: ID!
  userId: ID! @index(name: "byUserAndUpdated", sortKeyFields: ["updatedAt"])
  agentRoute: String!                # "curator" | "analyst" | "planner" | "multi"
  messages: AWSJSON                  # [{role, content, toolCalls?, toolResults?}]
  createdAt: AWSDateTime!
  updatedAt: AWSDateTime!
}
```

**Why store sessions:** the chat drawer shows recent sessions on reopen, and the orchestrator passes session history to agents for context. We cap stored history at 20 messages per session (older ones drop off, with a summary kept).

**Why JSON for messages and not a separate Message model:** read-modify-write on a single ChatSession item is cheaper than scanning a Message table per session, and we never need to query a single message in isolation. If the session grows past DynamoDB's 400 KB item limit, we summarize-and-truncate (rare).

The **curated problem bank** for `suggest_next_problem` is a static JSON file shipped with the Lambda (a few hundred problems with tags, difficulty, and a `prerequisite_tags` field for ordering). Stored in `backend/tools/data/problem-bank.json`. Updating the bank is a code change, not a runtime operation — that's fine for v2 scope.

---

## 7. Frontend Chat Drawer

The PWA gets a new component: a slide-in drawer on the right edge of the screen. Triggered by:
- A new chat icon in the topbar.
- The composer's "Add to tracker" button now sends to the Curator instead of the v1 single-call mutation. (The composer becomes a thin wrapper around the chat drawer's first message.)

### 7.1 UX

- **Open state:** drawer covers the right ~480px (full-screen on mobile).
- **Header:** chat session title (auto-generated from first message), close button, optional "switch agent" picker (shows current routed agent).
- **Body:** message list. User messages right-aligned; agent messages left-aligned; **tool call cards** inline (a small card showing `Tool: list_problems(filter: {difficulty: HARD})` collapsed by default, expandable to show args and result).
- **Footer:** textarea + send button.
- **Streaming:** as the orchestrator streams, the agent message accumulates incrementally and tool call cards animate in.

### 7.2 Streaming protocol

PWA opens a `fetch()` to `POST /chat/stream` (orchestrator Lambda Function URL with `RESPONSE_STREAM`) carrying JWT + sessionId + new message. We use `fetch` with a `ReadableStream` reader, not `EventSource`, because `EventSource` is GET-only and the request body carries the full message payload. The response body is server-sent-events formatted (`event: ...\ndata: ...\n\n`):

```
event: route
data: {"agent": "analyst", "reason": "User asked for analytics"}

event: agent_thinking
data: {"agent": "analyst", "delta": "Looking at your last 30 days..."}

event: tool_call
data: {"id": "tc_1", "tool": "analyze_profile", "args": {"window":"month"}}

event: tool_result
data: {"id": "tc_1", "result": {...}, "durationMs": 142}

event: agent_thinking
data: {"agent": "analyst", "delta": "You've been heavy on..."}

event: done
data: {"sessionId": "..."}
```

The PWA renders these in real time. Total latency for a typical interaction: 1–4 seconds.

### 7.3 What's NOT in chat

Per our brainstorming decision (option `c`): non-AI CRUD stays click-driven.
- Tile click → detail page (no chat).
- Edit tags on detail page → click on tag, type — direct GraphQL update.
- Adjust daily target → modal — direct GraphQL update.
- Delete via right-click / kebab menu on tile — direct GraphQL update.

**Curator handles only the "I just solved X" path** — adding new problems via paste — because that flow inherently needs LLM extraction. Other CRUD via Curator works (the MCP exposure makes it possible from Claude Desktop) but the in-PWA fast path is direct.

---

## 8. Deployment & Environments

### Auth strategy (locked in)

- **v2 launch:** email/password only via Cognito User Pool. Cognito stores password hashes server-side (Argon2 by default for new pools); the developer never handles raw passwords. No MFA, no email-verification gate (auto-confirm via post-confirmation trigger).
- **Why:** the developer explicitly does not want to manage passwords themselves. Cognito-managed email/password is "fully a service" — passwords leave the user's browser, hit Cognito, and never touch our app code or storage. From a portfolio-security perspective this is also the right choice (no rolling our own crypto).
- **Google OAuth federation deferred to Phase 7.** The wiring is straightforward (Cognito Hosted UI federation + `secret("GOOGLE_CLIENT_ID/SECRET")`); skipping it for v2 means sandbox iteration doesn't block on Google Cloud Console setup. When Phase 7 enables federation, existing email/password users keep working.

### Other deployment notes

- **MCP server**: deployed as its own Lambda Function URL with `RESPONSE_STREAM` mode, separate from AppSync. Custom domain `mcp.<your-domain>` with ACM cert (defer custom domain until v3 if you stay on the API GW URL for the PWA + an `*.execute-api.<region>.amazonaws.com` URL for MCP).
- **Per-environment Cognito client for MCP**: the static `mcp-clients` OAuth client is created in each Cognito pool (sandbox / dev / prod).
- **OpenAI API key** lives in Secrets Manager, accessed by `add_problem`, all three agent Lambdas, and the orchestrator's intent classifier. The local file `openai_key` (gitignored) is the source for `npx ampx sandbox secret set OPENAI_API_KEY < openai_key`.
- **Infra-as-code preference:** Amplify Gen 2 generates CloudFormation under the hood; that satisfies the "use CloudFormation" preference. Where Gen 2 doesn't expose a knob (custom resolvers, S3 lifecycle rules, Lambda Function URL streaming mode), we drop into CDK (which still emits CFN) inside `amplify/backend.ts`.

### Environments

- **Sandbox**: per-developer ephemeral stack (`npx ampx sandbox`). MCP server URL is dynamic per sandbox (e.g. `https://abc123.execute-api.us-east-1.amazonaws.com/`). Local Claude Desktop config points at it for end-to-end testing.
- **Dev**: long-lived, points at a `dev.lc-tracker.example.com` if you have a domain, otherwise the API GW URL.
- **Prod**: `mcp.lc-tracker.example.com`.

---

## 9. Guardrails

Same five from v1 plus:

- **MCP client tracking**: log connecting client IDs in CloudWatch. Alarm if an unknown client makes >100 tool calls in 5 minutes.
- **Per-tool rate limit**: `add_problem` keeps the v1 daily limit (50/user/day). Other tools allowed 200/day per user as a sanity ceiling against runaway agent loops.
- **Agent loop ceiling**: each agent invocation can do at most 10 tool calls before the orchestrator forces a stop and returns "agent ran out of steps". Prevents pathological cases.

---

## 10. Error Handling Contract

In addition to v1's contract:

| Source | `errorType` | Frontend behavior |
|---|---|---|
| Orchestrator | `INTENT_CLASSIFICATION_FAILED` | Fall back to a default agent (Analyst); log warning |
| Agent | `MAX_TOOL_CALLS_EXCEEDED` | Show "agent gave up after 10 steps", offer retry |
| Agent | `AGENT_TIMEOUT` (30s) | Show "agent is slow today", offer retry |
| MCP server | standard MCP error codes | (consumed by external client, not by PWA) |

---

## 11. Testing Strategy

- **Tools layer**: every tool gets unit tests in `backend/tools/__tests__/`, mocking only AWS clients. `add_problem` additionally mocks the OpenAI SDK. Coverage target: 100% of tool functions, ~80% of branches.
- **Agents**: integration tests run each agent end-to-end against a live sandbox stack with a recorded conversation (say, 5 canonical user turns). Validate that the agent calls the right tools and returns sensible final messages. *Do not* assert exact wording — model output drift is normal; assert tool-call sequences and response structure (which tools were invoked, in what order).
- **MCP server**: a smoke test that runs `npx @modelcontextprotocol/inspector` against a deployed sandbox and verifies tool listing + a `list_problems` call succeed.
- **Orchestrator**: unit tests for the intent classifier (mocked small-model OpenAI call) + integration tests for the streaming path (assert the SSE event sequence).
- **Frontend chat drawer**: defer formal tests until v3.

---

## 12. Demo Playbook (Interview Prep)

This is part of the spec because the demo *is* the deliverable for a portfolio project.

**Setup before interview:**
- Prod stack deployed.
- A pre-populated demo account with ~30 problems across tags (so analyses produce non-trivial output).
- Claude Desktop configured with the prod MCP server.

**Demo flow (~5 minutes):**

1. Open the PWA, sign in. Show the heatmap and tile grid — visual hook.
2. Open the chat drawer. Type "I just solved LRU Cache, here's my code: [paste]". Curator extracts and adds the tile in real time. **Show the tool call card animating in.**
3. Type "Analyze my weakest area this month". Analyst calls `analyze_profile`, narrates: "You've been heavy on arrays (12 problems) but only one graph problem...".
4. Type "Make me a 5-day plan to fix that". Planner calls `generate_study_plan(days: 5, focus: "graph")`, returns a structured plan rendered as a table.
5. **Switch to Claude Desktop.** Show the MCP server already connected (configured before demo). Type "Hey, what's on day 1 of my study plan from yesterday?". Claude Desktop calls `list_problems` over MCP, retrieves the data, narrates.
6. Close out: "Same MCP server feeds my own PWA's agents and external clients like Claude Desktop. One tool implementation, two transports."

**Architectural talking points** (have ready):
- Why shared lib instead of agents-call-MCP. (Latency.)
- Why three agents instead of one. (Specialization + story.)
- How OAuth 2.1 with Cognito works without DCR. (Static client + shim.)
- How `add_problem` is the only tool that calls OpenAI. (Cost transparency.)
- How the agent loop is bounded. (Max 10 tool calls per invocation.)

---

## 13. Open Questions for v3

- Custom domain for both PWA and MCP (currently `*.amplifyapp.com` + API GW URL).
- Streaming tool results from MCP (some tools could yield partial — `generate_study_plan` could stream day-by-day).
- A 4th agent ("Coach") that has memory of past sessions and tracks progress over weeks.
- Public read-only profile pages (deliberately deferred — not a portfolio differentiator).
- Caching the curated problem bank in DynamoDB (so it can be updated without redeploy).

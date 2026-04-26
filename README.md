# Leetcode Tracker

A Leetcode practice tracker that takes any pasted solution, uses an LLM to auto-extract the problem metadata, and surfaces it in a heatmap-driven PWA. The backend is built around an MCP server: nine tools shared between an in-app multi-agent chat (Curator / Analyst / Planner specialized agents + an intent-classifier orchestrator) and external MCP clients like Claude Desktop.

## Demo

- **Paste a solution, get a tile.** Drop any solution code into the composer; `add_problem` extracts number, title, difficulty, tags, description, and constraints in one OpenAI call and writes a Problem row.
- **Heatmap of activity.** GitHub-style 365-day grid driven by the `byUserAndDate` GSI on the Problem table.
- **Chat drawer with three agents.** Ask "how am I doing on graphs?" (Analyst), "what should I do next?" (Planner), or "I just solved 207" (Curator). The orchestrator routes via a one-call intent classifier and chains agents on composite intents.
- **MCP from Claude Desktop.** Add the MCP server URL to `claude_desktop_config.json`, OAuth pop-up signs you into Cognito, and now Claude Desktop can call `add_problem`, `analyze_profile`, `generate_study_plan` against your tracker.

## Architecture

```
┌─────────────────────────────┐         ┌──────────────────────────┐
│  Browser (Vite + React PWA) │         │  External MCP clients    │
│  · Cognito Authenticator    │         │  · Claude Desktop        │
│  · Heatmap + tiles + detail │         │  · Cursor / Codex / etc. │
│  · Chat drawer (SSE stream) │         └─────────────┬────────────┘
└──────┬───────────────┬──────┘                       │
       │ AppSync       │ Function URL (SSE)           │ Streamable HTTP + OAuth 2.1
       │ GraphQL       │                              │ (Bearer JWT)
       │ (Cognito JWT) │                              │
       ▼               ▼                              ▼
┌──────────────┐ ┌────────────────────┐ ┌──────────────────────────┐
│  AppSync     │ │  chat-stream       │ │  mcp-server              │
│  (Amplify    │ │  Lambda            │ │  Lambda (FN URL,         │
│   Data, Gen2)│ │  · Orchestrator    │ │   RESPONSE_STREAM)       │
│              │ │  · Intent classify │ │  · OAuth metadata        │
│              │ │  · Agent chaining  │ │  · DCR shim              │
│              │ │                    │ │  · MCP Streamable HTTP   │
└──────┬───────┘ └────┬───────────┬───┘ └────┬───────────┬─────────┘
       │              │           │          │           │
       │              │           │          │           │
       │              ▼           ▼          ▼           ▼
       │     ┌──────────────────────────────────────────────┐
       │     │  Agents:  Curator | Analyst | Planner        │
       │     │  · OpenAI Chat Completions, tool-call loop   │
       │     │  · System-prompt-specialized                 │
       │     │  · 10-call cap, 30s timeout                  │
       │     └────────────────────┬─────────────────────────┘
       │                          │ direct function imports
       │                          ▼
       │     ┌──────────────────────────────────────────────┐
       │     │  Tools: backend/tools/*.ts (9 tools)         │
       │     │  add_problem (LLM)  list_problems  get_*     │
       │     │  update_problem  delete_problem  daily_*     │
       │     │  analyze_profile  suggest_next  generate_*   │
       │     └────────┬──────────────────┬──────────────────┘
       │              │                  │
       ▼              ▼                  ▼
┌─────────────┐ ┌─────────────┐ ┌──────────────────┐
│ DynamoDB    │ │ S3          │ │ OpenAI API       │
│ Problem     │ │ ai-logs     │ │ gpt-5 (reason)   │
│ User        │ │ exports     │ │ gpt-5-mini       │
│ RateLimit   │ │             │ │   (intent)       │
│ ChatSession │ │             │ │                  │
└─────────────┘ └─────────────┘ └──────────────────┘
```

The PWA hits AppSync directly for plain CRUD (lists, tag edits) and the chat-stream Lambda for the agent-driven flow. External MCP clients hit the public mcp-server Lambda. Both Lambdas reuse the same nine tool implementations; nothing crosses through the MCP wire when an internal agent calls a tool.

## Tech stack

- **Frontend:** Vite + React, Amplify JS v6 (`aws-amplify/auth`, `aws-amplify/api`), `@aws-amplify/ui-react` Authenticator, hand-rolled SSE-over-fetch client, vanilla CSS with custom design tokens.
- **Backend:** TypeScript, Amplify Gen 2 (`@aws-amplify/backend`, CDK under the hood), AWS Lambda with `RESPONSE_STREAM` invoke mode, AppSync (Cognito-authorized GraphQL), DynamoDB, S3 with lifecycle rules, Cognito User Pool + hosted UI domain.
- **Agents:** OpenAI Chat Completions function calling, custom `runAgent` loop with tool-call cap and timeout, intent classifier on `gpt-5-mini`, reasoning agents on `gpt-5`.
- **MCP:** `@modelcontextprotocol/sdk` `Server` + `StreamableHTTPServerTransport`, OAuth 2.1 metadata (RFC 8414), Dynamic Client Registration shim, `jose` for Cognito JWKS verification.
- **Tests:** `vitest` for the tool layer (57 unit tests), each tool unit-testable in isolation because eight of nine are pure data ops.
- **Ops:** CloudWatch alarms (Lambda error rate, Lambda invocation volume, AppSync 5xx) wired to an SNS email topic; Amplify Hosting build spec for branch deploys.

## What's interesting

### 1. Shared tool layer, two transports

The nine tools (`add_problem`, `update_problem`, `delete_problem`, `list_problems`, `get_problem`, `analyze_profile`, `suggest_next_problem`, `generate_study_plan`, `daily_summary`) live in `backend/tools/` as pure-ish TypeScript functions. Every tool exports a `ToolDefinition` of this shape:

```ts
// backend/tools/_types.ts
export interface ToolDefinition<I, O> {
  name: string;
  description: string;
  inputSchema: z.ZodType<I>;
  outputSchema: z.ZodType<O>;
  execute: (ctx: ToolContext, input: I) => Promise<O>;
  // JSON Schema for OpenAI function calling and MCP tool registry
  jsonSchema: object;
}
```

Two consumers wire that registry up:

- **The agent layer** imports `toolByName(...)` from `backend/tools/index.ts`, hands `jsonSchema` straight into OpenAI's `tools: [{ type: "function", function: {...} }]` array, and on a `tool_calls` response calls `tool.execute(ctx, validated)` in-process. No MCP RPC overhead in the hot path.
- **The MCP server** in `backend/functions/mcp-server/handler.ts` registers each tool with `Server.setRequestHandler(CallToolRequestSchema, ...)`, exposing the same `execute` over the open MCP protocol via Streamable HTTP.

One implementation, two transports, no cross-talk. The same `execute(ctx, input)` runs whether the caller is an in-app Curator agent or Claude Desktop on someone's laptop. Of the nine tools, only `add_problem` makes an OpenAI call (the extraction); the other eight are deterministic data ops, which is why the tool layer has 57 vitest unit tests with minimal mocking.

### 2. Three specialized agents + intent-classifier orchestrator

Instead of a single agent with all nine tools, three agents each get a system prompt tuned for their job and a tool subset:

| Agent | System-prompt focus | Tool subset |
|---|---|---|
| **Curator** | "Confirm before destructive ops. After a successful action, briefly state what you did." | `add_problem`, `update_problem`, `delete_problem`, `get_problem` |
| **Analyst** | "Use tools to fetch data and produce factual, concise observations. Never fabricate." | `list_problems`, `get_problem`, `analyze_profile`, `daily_summary` |
| **Planner** | "Always justify each recommendation by tag-coverage gap or stated focus area." | `list_problems`, `analyze_profile`, `suggest_next_problem`, `generate_study_plan` |

The orchestrator (`backend/agents/orchestrator.ts`) does Haiku-style intent classification — one cheap call to `gpt-5-mini` returning one of `curator | analyst | planner | multi:analyst-then-planner` — and routes the user message:

```ts
// backend/agents/orchestrator.ts
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
```

Each agent invocation runs through the same `runAgent` loop in `backend/agents/_shared.ts`, which streams `thinking | tool_call | tool_result | done` events and is bounded by `MAX_TOOL_CALLS = 10` and `AGENT_TIMEOUT_MS = 30_000`. System-prompt specialization beats one-prompt-with-all-concerns; the multi-agent chaining is a dumb pipe (no agent-to-agent talk) so the system stays explainable and debuggable.

### 3. MCP server protected by OAuth 2.1 with a Cognito + DCR shim

The public MCP server is a single Lambda Function URL with `RESPONSE_STREAM` invoke mode, speaking the open MCP protocol via `@modelcontextprotocol/sdk`'s `StreamableHTTPServerTransport`. Auth is OAuth 2.1 with PKCE per the MCP spec — but the spec also requires Dynamic Client Registration (RFC 7591), which Cognito doesn't natively support, so the same Lambda runs a small DCR shim that returns a static Cognito app client.

The Lambda routes three URL paths:

1. `GET /.well-known/oauth-authorization-server` — RFC 8414 metadata
2. `POST /register` — DCR shim (returns the same `client_id` regardless)
3. anything else — MCP Streamable HTTP transport, JWT-verified in-handler via `jose`'s `RemoteJWKSet`

Live metadata from the deployed sandbox:

```json
{
  "issuer": "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_2LgrOc78F",
  "authorization_endpoint": "https://lc-tracker-831250773717.auth.us-east-1.amazoncognito.com/oauth2/authorize",
  "token_endpoint": "https://lc-tracker-831250773717.auth.us-east-1.amazoncognito.com/oauth2/token",
  "jwks_uri": "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_2LgrOc78F/.well-known/jwks.json",
  "registration_endpoint": "https://<lambda-url>/register",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "token_endpoint_auth_methods_supported": ["none"],
  "code_challenge_methods_supported": ["S256"]
}
```

This is the demo button. Open Claude Desktop, add the MCP server URL to `claude_desktop_config.json`, the OAuth pop-up opens Cognito's hosted UI, sign in, and now Claude Desktop can call `add_problem`, `analyze_profile`, `generate_study_plan` against the user's tracker. Same nine tools, the second transport. The Function URL is `authType=NONE` because JWT verification happens inside the handler against Cognito's JWKS — no API Gateway in the hot path.

## Run locally

Prereqs: Node 20+, npm, AWS CLI configured for an account where you can deploy a sandbox.

1. Clone and install:

   ```bash
   git clone <repo-url>
   cd leetcode
   (cd frontend && npm install)
   (cd backend && npm install)
   (cd amplify && npm install)
   ```

2. Set the OpenAI API key. The local file `openai_key` is gitignored; the value gets pushed to Secrets Manager via Amplify's `sandbox secret` command.

   ```bash
   echo "sk-proj-..." > openai_key
   cat openai_key | tr -d '\n' | npx ampx sandbox secret set OPENAI_API_KEY
   ```

3. Deploy the sandbox:

   ```bash
   npx ampx sandbox
   ```

   Wait for `[Success] Deployment completed in N seconds`. Amplify writes `amplify_outputs.json` at the repo root (Cognito IDs, AppSync URL, custom outputs `mcpServerUrl` and `chatStreamUrl`).

4. In another terminal, run the frontend:

   ```bash
   cd frontend && npm run dev
   ```

   Open `http://localhost:8765/`. The Cognito Authenticator UI appears — sign up with an email, confirm via the code Cognito emails you, and you're in.

5. (Optional) Connect Claude Desktop to the MCP server. Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

   ```json
   {
     "mcpServers": {
       "lc-tracker": {
         "url": "<paste mcpServerUrl from amplify_outputs.json>"
       }
     }
   }
   ```

   Restart Claude Desktop. The OAuth pop-up signs you into Cognito; afterward Claude Desktop can operate your tracker.

## Deploy

See [`docs/MANUAL_OPS.md`](docs/MANUAL_OPS.md) for the AWS Console steps (Amplify Hosting GitHub connection, branch secrets, AWS Budgets). Pipeline-style deploys for `main` use the `amplify.yml` build spec at the repo root, which runs `npx ampx pipeline-deploy` on the backend stack and `npm run build` on `frontend/`.

## Repository layout

```
leetcode/
├── frontend/                       Vite + React + amplify-js + chat drawer
│   └── src/
│       ├── App.jsx                 Authenticator + route shell
│       ├── pages/                  HomePage, DetailPage
│       ├── components/             Heatmap, Tile, ChatDrawer, ToolCallCard, ...
│       └── lib/
│           ├── api.js              AppSync GraphQL via amplify-js
│           ├── chat.js             SSE-over-fetch client for chat-stream
│           └── date.js             heatmap bucketing
├── backend/
│   ├── tools/                      9 tools, _types.ts, ALL_TOOLS registry
│   ├── agents/                     curator, analyst, planner, orchestrator, _shared
│   ├── functions/
│   │   ├── mcp-server/             public OAuth-protected MCP Lambda
│   │   ├── chat-stream/            SSE orchestrator entry for the PWA
│   │   └── export-data/            on-demand JSON export to S3
│   ├── monitoring/                 CloudWatch alarms + SNS topic
│   ├── auth/                       post-confirmation Lambda
│   ├── data/                       Amplify Data schema
│   └── storage/                    ai-logs + exports buckets
├── amplify/
│   ├── backend.ts                  defineBackend(...) + cross-resource wiring
│   ├── auth/resource.ts            Cognito User Pool config
│   ├── data/resource.ts            AppSync schema definition
│   ├── functions/                  per-Lambda resource shims
│   └── storage/resource.ts         S3 bucket definitions
├── docs/
│   ├── superpowers/specs/          design specs (v1, v2)
│   ├── superpowers/plans/          implementation plans (v1, v2)
│   └── MANUAL_OPS.md               out-of-code deployment steps
├── amplify.yml                     Amplify Hosting build spec
└── openai_key                      (gitignored; you provide)
```

## Status & limitations

- Sandbox deployed and verified end-to-end: Cognito auth, GraphQL CRUD, MCP server reachable with live OAuth metadata, chat drawer streaming SSE events from the orchestrator.
- 57 backend unit tests passing across the nine tools (`vitest` in `backend/tools/__tests__/`).
- Production deploy via Amplify Hosting requires manual GitHub repo connection in the AWS Console — see [`docs/MANUAL_OPS.md`](docs/MANUAL_OPS.md). The pipeline build spec (`amplify.yml`) is committed and ready, but Amplify Hosting needs a UI-driven first connect.
- Google OAuth federation is wired in code but commented out for the v2 launch (deferred to a later phase, when GCP credentials are ready).
- The MCP server's Dynamic Client Registration is a static shim — every `POST /register` returns the same `client_id`. Fine for portfolio demos and single-tenant use, but a production-grade implementation would store registrations in DynamoDB and issue per-client IDs.
- The post-confirmation Cognito trigger (which would auto-create a `User` row on signup) is decoupled to break a circular nested-stack dependency between `auth` and `data`. The frontend's `ensureUser` call covers the gap on first load. There's a `TODO(phase3)` in `amplify/backend.ts` documenting the cycle and the two possible fixes.
- `apple-touch-icon.png` references in `frontend/index.html` still point at older asset paths; will fix in a follow-up polish pass.
- Rate limits: `add_problem` is capped at 50/user/day (the only tool that calls OpenAI), other tools at 200/user/day on the MCP surface to bound abuse, and each agent invocation is capped at 10 tool calls and 30 seconds.

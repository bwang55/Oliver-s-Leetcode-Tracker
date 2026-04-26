# Leetcode Tracker — Backend Design

**Date:** 2026-04-25
**Status:** Approved, ready for implementation plan
**Stack:** AWS Amplify Gen 2 (Cognito + AppSync + DynamoDB + Lambda + S3 + Hosting), Anthropic API for AI extraction

---

## 1. Goals & Constraints

The frontend prototype currently runs as a Babel-standalone React app with mocked data. We replace mocks with a real backend that:

- Persists per-user problems, tags, solutions, and progress.
- Lets a logged-in user paste a solution and get back an AI-extracted problem record (number, title, difficulty, tags, description, constraints).
- Renders a 16-week heatmap of activity.
- Is publicly registrable (email/password + Google OAuth) but financially bounded — risk is capped by funding the Anthropic account modestly, not by application-layer paywalls.
- Targets ~50 concurrent users (small social/friends scale) but uses a production-form architecture so it can scale further without rewrite.

**Non-goals:**
- MFA, email verification flows beyond Cognito defaults.
- Social features (sharing, leaderboards).
- Mobile native app — the existing PWA is the mobile path.
- Multi-region replication, disaster recovery beyond default AWS durability.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (PWA)                        │
│   Vite-built SPA · amplify-js SDK · Cognito JWT in memory   │
└──────────────────┬──────────────────────────────────────────┘
                   │  GraphQL over HTTPS, JWT in Authorization header
                   ▼
┌─────────────────────────────────────────────────────────────┐
│                  AWS AppSync (GraphQL API)                  │
│  · Cognito User Pool authorizer                             │
│  · @model resolvers → DynamoDB direct (CRUD)                │
│  · custom resolver → Lambda (extractProblem, exportData)    │
└────────┬───────────────────────────────────┬────────────────┘
         │                                   │
         ▼                                   ▼
┌──────────────────┐                ┌────────────────────────┐
│    DynamoDB      │                │   Lambda Functions     │
│  Problem table   │                │ · extractProblem       │
│  User table      │                │ · exportData           │
│  RateLimit table │                │ · postConfirmation     │
└──────────────────┘                └─────┬───────────┬──────┘
                                          │           │
                                          ▼           ▼
                            ┌─────────────────┐  ┌──────────────┐
                            │ Anthropic API   │  │  S3 Buckets  │
                            │ (key in Secrets │  │ · exports    │
                            │  Manager)       │  │ · ai-logs    │
                            └─────────────────┘  └──────────────┘
```

**Selected approach (chosen during brainstorming):** Amplify Gen 2 *automatic* mode for 90% of CRUD, with *targeted custom resolvers* for the heatmap query and AI-driven mutations. This avoids the rigid single-table layout you'd hand-design but lets us add custom GSIs and Lambda integrations where they matter.

---

## 3. Authentication & User Lifecycle

**Identity provider:** Amazon Cognito User Pool, configured by Amplify Auth.

- **Email/password registration** (Cognito default).
- **Google OAuth** via Cognito Hosted UI federation. Google client ID/secret stored in Secrets Manager.
- **No MFA**, **no email verification gate** at first launch (auto-confirm via post-confirmation trigger). We will revisit if abuse appears.
- **JWT propagation:** amplify-js attaches the Cognito ID token automatically to every GraphQL request; AppSync validates it.

**Post-confirmation Lambda trigger** (`postConfirmation`):
1. Read `event.userName` (Cognito sub) and `event.request.userAttributes.email`.
2. Insert a row into the `User` table: `{ userId: sub, email, displayName: email, dailyTarget: 3, createdAt: now }`.
3. Idempotent — uses `attribute_not_exists(userId)` so retries don't double-insert.

**Source of truth for user preferences:** the `User` row in DynamoDB, *not* Cognito custom attributes. Reasons: Cognito custom attributes are a pain to migrate, and the dailyTarget is read on every page load, which is cheaper from DynamoDB than from Cognito.

---

## 4. Data Model (DynamoDB via Amplify Data)

```graphql
# amplify/data/resource.ts (sketch)

type User
  @model
  @auth(rules: [{ allow: owner, ownerField: "userId" }])
{
  userId: ID! @primaryKey                  # Cognito sub
  email: AWSEmail!
  displayName: String
  dailyTarget: Int!                        # default 3
  createdAt: AWSDateTime!
}

type Problem
  @model
  @auth(rules: [{ allow: owner, ownerField: "userId" }])
{
  id: ID!
  userId: ID! @index(name: "byUserAndDate", sortKeyFields: ["solvedAt"])
  number: Int!
  title: String!
  difficulty: Difficulty!
  tags: [String!]!
  solvedAt: AWSDateTime!                   # ISO 8601
  description: String
  constraints: [String!]
  solutions: AWSJSON                       # { python, cpp, java }
  note: String
  createdAt: AWSDateTime!
  updatedAt: AWSDateTime!
}

enum Difficulty { EASY MEDIUM HARD }

type RateLimit
  @model
  @auth(rules: [{ allow: private, provider: iam }])  # only Lambdas, never users
{
  userId: ID! @primaryKey(sortKeyFields: ["dayKey"])
  dayKey: String!                           # YYYY-MM-DD
  aiCallCount: Int!
  ttl: AWSTimestamp                         # 7 days, auto-cleanup
}
```

**Access patterns and how they're served:**

| Use case | Resolver | Path |
|---|---|---|
| List my problems, newest first | Amplify auto | `Problem.byUserAndDate (userId, solvedAt DESC)` GSI |
| Heatmap (problems in last 16 weeks) | Amplify auto | Same GSI, `solvedAt >= today - 112d` filter |
| Open problem detail | Amplify auto | `Problem(id)` |
| AI rate limit check + bump | Custom Lambda resolver | DynamoDB `UpdateItem` with `ADD aiCallCount :one` (atomic) |
| Export all my data | Custom Lambda | Scan via GSI, write JSON to S3, return signed URL |

**Why `RateLimit` is its own table:** keeps user preferences (rarely written) out of the same partition as a hot atomic counter (written every AI call).

**Why `RateLimit` is IAM-auth, not owner-auth:** users must not be able to read or modify their own counters via direct GraphQL. Only Lambda can touch them.

---

## 5. API Surface (GraphQL)

Amplify Data auto-generates `get/list/create/update/delete` for each `@model` (scoped by `@auth`). On top of that we add:

```graphql
type ExtractedProblem {
  problem: Problem!
}

type ExportLink {
  url: AWSURL!
  expiresAt: AWSDateTime!
}

extend type Mutation {
  # paste a solution → AI extracts metadata, persists Problem, returns it
  extractProblem(solutionText: String!): ExtractedProblem!
    @auth(rules: [{ allow: private }])

  # generate a JSON dump of my data, upload to S3, return signed URL
  exportMyData: ExportLink!
    @auth(rules: [{ allow: private }])
}
```

The frontend will *not* call `createProblem` directly for AI-extracted entries — it always goes through `extractProblem`, which both calls Anthropic and creates the row inside one transaction (well, one Lambda invocation; we accept "best-effort atomicity" — see error handling below).

---

## 6. AI Extraction Lambda (`extractProblem`)

**Runtime:** Node.js 20, ARM64, 512 MB, timeout 30s. Not in a VPC (Anthropic egress).

**Flow:**

1. **Identity:** read `event.identity.sub` → `userId`. Reject if missing (shouldn't happen with @auth).
2. **Rate limit check:** atomic `UpdateItem` on `RateLimit(userId, today)`:
   ```
   UpdateExpression: ADD aiCallCount :one SET ttl = :ttl
   ConditionExpression: attribute_not_exists(aiCallCount) OR aiCallCount < :max
   ```
   On `ConditionalCheckFailedException` → return `RATE_LIMIT_EXCEEDED` GraphQL error. Default `MAX = 50/day`.
3. **Load Anthropic key:** Secrets Manager `GetSecretValue`, cached in Lambda module scope (fetched once per warm container).
4. **Call Anthropic:** model `claude-sonnet-4-6` (cheap, fast, plenty for this task), with:
   - **Tool use** mode for structured output (the model emits a `leetcode_extraction` tool call with the schema we define).
   - **Prompt caching** (`cache_control: {type: "ephemeral"}`) on the system prompt and tool definition. Repeat extraction calls cost ~10% of first call after cache warm-up.
   - 15 second timeout on the HTTP call (Lambda has 30s budget; leaves 15s for cold start, DynamoDB writes, S3 logging).
5. **Parse tool result:** validate against schema (zod). The tool schema includes a `language: "python" | "cpp" | "java" | "other"` field so we can route the pasted code into the right `solutions.{lang}` slot. On parse failure → return `AI_INVALID_RESPONSE`.
6. **Persist Problem row:** `PutItem` with `solutions[language] = solutionText` (default `python` if model returns `other` or omits the field), other slots empty strings. Also writes `userId`, generated `id`, `solvedAt = now()`. Use `ConditionExpression: attribute_not_exists(id)` to be safe.
7. **Async S3 log:** fire-and-forget `PutObject` to `lc-tracker-ai-logs/{YYYY}/{MM}/{DD}/{userId}/{requestId}.json` with the raw request and response. We do not await this; failure is logged but does not bubble up.
8. **Return:** the persisted `Problem` to the GraphQL caller.

**Error matrix:**

| Failure | Surfaced as | Counted against rate limit? |
|---|---|---|
| Anthropic 5xx (after 1 retry) | `AI_SERVICE_UNAVAILABLE` | No (rollback the increment) |
| Anthropic 429 | `AI_SERVICE_UNAVAILABLE`, retry-after surfaced | No |
| Lambda timeout | client sees generic GraphQL timeout | No (DynamoDB conditional won't have committed) |
| Tool parse failure | `AI_INVALID_RESPONSE` | Yes (we did spend a token call) |
| User over 50/day | `RATE_LIMIT_EXCEEDED` | n/a |
| DynamoDB write failure after AI succeeds | `PERSIST_FAILED` (rare) | Yes |

**Prompt design (system prompt, abbreviated):**

> You are a Leetcode problem identifier. Given a code solution that purports to solve a Leetcode problem, identify the problem number, exact title, difficulty (Easy/Medium/Hard), algorithmic tags (e.g. "array", "dp", "two-pointer"), a brief problem description, and constraints. Use the `record_extraction` tool to return your answer. If you cannot identify the problem with high confidence, set `confidence: "low"` and provide your best guess.

The tool schema enforces shape; the model returns JSON we can `zod.parse()`.

---

## 7. S3 Buckets

**Two buckets**, both block all public access, AES256 SSE.

### `lc-tracker-exports-{env}`

- **Layout:** `{userId}/exports/{ISO-timestamp}.json`
- **Lifecycle:** delete objects older than 30 days.
- **Access:** Lambda `exportMyData` writes; client receives a 5-minute presigned GET URL.
- **CORS:** allow GET from the Amplify Hosting domain + localhost dev port.

### `lc-tracker-ai-logs-{env}`

- **Layout:** `YYYY/MM/DD/{userId}/{requestId}.json` (each entry contains both request and response payloads).
- **Lifecycle:** Standard → Standard-IA at 30 days, delete at 90 days.
- **Access:** only the `extractProblem` Lambda execution role can `PutObject`. Nobody (including users) reads via GraphQL — this is engineering-side data.
- **PII concern:** these logs contain the user's pasted code and the user's UUID. Document this in the privacy footer (when we have one); for now, internal-only use.

---

## 8. Frontend Workstream — Bundler Migration

The current frontend (`frontend/index.html` + Babel-standalone) cannot consume `aws-amplify`. Migration:

**Tooling:**
- Convert `frontend/` to an npm project: `package.json`, Vite as dev server and bundler, `vite-plugin-pwa` to manage manifest + service worker (replaces our hand-written `sw.js`).
- Keep file structure (`src/`, `styles/`, `assets/`) — Vite's defaults align.
- Preserve JSX (no forced TypeScript migration; can opt-in later for type-safe Amplify Data client).

**Dependencies (initial):**
- `react`, `react-dom` (was CDN, now npm).
- `aws-amplify` — auth, data client.
- `@aws-amplify/ui-react` — pre-built `<Authenticator>` for the login UI (Amplify Auth's happy path).
- `vite`, `@vitejs/plugin-react`, `vite-plugin-pwa`.

**Code changes:**
- `src/data.js` → keep `FAKE_BANK` and date helpers; remove `SAMPLE_PROBLEMS` (real data comes from API). Date helpers stay.
- `src/app.jsx` → wrap with `<Authenticator>`; replace `useState(SAMPLE_PROBLEMS)` with Amplify Data client `client.models.Problem.list()` and an effect.
- `src/components.jsx` → split into one-component-per-file (`src/components/Tile.jsx`, `Heatmap.jsx`, `Composer.jsx`, etc.) for readability; logic is unchanged.
- Composer's `onComposerSubmit` becomes `await client.mutations.extractProblem({ solutionText })` (no more setTimeout/FAKE_BANK). The existing optimistic UX is preserved: increment `pending` count immediately so a skeleton tile renders, await the mutation, then on resolve replace the skeleton with the returned `Problem` (decrement pending, prepend to list). Errors revert the optimistic state and show a toast per the error contract in §11.
- Theme toggle and `dailyTarget` move from localStorage to the `User` row; localStorage stays as offline-first cache, but server is source of truth on login.

**Service worker:** Vite-plugin-pwa generates `sw.js` from manifest config; we delete the hand-written one. Cache strategy stays "cache-first, with network update" for static assets, "network-first, fall back to cache" for the GraphQL endpoint (so stale data appears offline but fresh data wins online).

---

## 9. Deployment & Environments

**Backend (Amplify Gen 2):**
- `amplify/backend.ts` defines: auth (with Google federation), data (the schema above), three custom Lambda functions (`extractProblem`, `exportData`, `postConfirmation`), and the two S3 buckets (declared via Storage construct or raw CDK).
- **Secrets:** Anthropic API key and Google OAuth client secret are *not* committed; they're set per environment via `npx ampx sandbox secret set ANTHROPIC_API_KEY` for dev, and via Amplify console UI for prod. Lambdas read them at cold start.
- **Environments:**
  - **Sandbox** (per developer): `npx ampx sandbox` — ephemeral, isolated.
  - **Dev** (a long-lived branch deployment): connected to a `dev` git branch.
  - **Prod**: connected to `main`. Auto-deploy on push.

**Frontend (Amplify Hosting):**
- Connect GitHub repo. `amplify.yml` build spec:
  ```yaml
  version: 1
  applications:
    - frontend:
        phases:
          preBuild:
            commands:
              - cd frontend && npm ci
          build:
            commands:
              - npm run build
        artifacts:
          baseDirectory: frontend/dist
          files: ['**/*']
        cache:
          paths: [frontend/node_modules/**/*]
      appRoot: frontend
  ```
- `main` branch auto-deploys to the public URL. Default `*.amplifyapp.com` domain at first; custom domain optional later.
- Amplify Hosting injects `aws-exports.js` (or its Gen 2 equivalent `amplifyconfiguration.json`) at build time, pointing the frontend at the right backend stack.

---

## 10. Guardrails (Monitoring, Cost, Abuse)

**Per-user rate limit:** `RateLimit` table, default 50 AI calls/user/day, configurable via Lambda env var. Atomic `UpdateItem` with `ConditionExpression`.

**CloudWatch Alarms (all → SNS topic → email to project owner):**
- `extractProblem` Lambda errors > 5 in 5 minutes.
- `extractProblem` invocations > 1000 in 1 hour (volumetric anomaly).
- DynamoDB `UserErrors` or `ThrottledRequests` > 0 in 5 minutes.
- AppSync 5xx errors > 5 in 5 minutes.

**AWS Budgets:** monthly cap $20, alert at 80% and 100%.

**Anthropic-side budget:** the user is expected to set a monthly budget in their Anthropic Console. This is the ultimate cost ceiling — application-layer rate limit is the first line of defense, not the only one.

**Logging:** all Lambdas log to CloudWatch with default retention; we set retention to 14 days to avoid log accumulation. Structured JSON logs (`{level, msg, userId, requestId, ...}`) for queryability.

---

## 11. Error Handling Contract

GraphQL errors use AppSync's `errorType` field. Frontend maps these:

| `errorType` | Frontend behavior |
|---|---|
| `Unauthorized` (Cognito JWT invalid/expired) | redirect to login, clear amplify session |
| `RATE_LIMIT_EXCEEDED` | toast "Today's AI quota is used up — try again tomorrow" |
| `AI_SERVICE_UNAVAILABLE` | toast "AI is temporarily unavailable, please retry" |
| `AI_INVALID_RESPONSE` | toast "Couldn't extract this one — try a clearer paste" |
| `PERSIST_FAILED` | toast "Save failed, please retry" |
| any other | generic "Something went wrong" toast, log to console |

The composer keeps the user's pasted text on error so they can retry without losing it.

---

## 12. Testing Strategy

**Backend:**
- Lambda unit tests (Vitest in the Amplify functions): mock `@anthropic-ai/sdk` and the AWS SDK clients (DynamoDB, S3, SecretsManager). Test:
  - rate-limit conditional logic (under, at, over).
  - tool-result parsing (valid, malformed, missing fields).
  - rollback path on Anthropic failure.
- Integration tests against `npx ampx sandbox`: amplify-js client → real AppSync → real DynamoDB. CI runs a small smoke test.
- No load tests planned for v1.

**Frontend:**
- Defer formal component tests for v1 (the prototype already worked end-to-end with mocks; we trust the visual review to catch regressions).
- Add Vitest tests for the data-fetching hooks once they stabilize.

---

## 13. Open Questions for v2 (not blocking v1)

- Custom domain on Amplify Hosting (currently `*.amplifyapp.com` is fine).
- Supabase-style "social proof" (public profiles) — explicit non-goal for now.
- `Submission` history (multiple attempts per problem with timestamps and pass/fail) — frontend currently shows one solution per problem; if we want history, add `Submission` model with `problemId` index.
- Anthropic prompt cache stats per user (visible in AI logs S3) — useful for cost analysis once we have data.

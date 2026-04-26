# Leetcode Tracker — Backend Implementation Plan v2 (Multi-Agent + MCP)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Leetcode Tracker with a multi-agent backend (Curator / Analyst / Planner + Orchestrator) over a shared tool layer, exposed both internally to the PWA chat drawer and externally as a public MCP server.

**Architecture:** Three-layer system. (1) Shared tool layer in `backend/tools/` — 9 pure-ish TypeScript functions wrapping DynamoDB / S3 / OpenAI. (2) Agent layer in `backend/agents/` — 3 specialized agents (configurable reasoning model, default `gpt-5`) + an intent-classifier orchestrator (default `gpt-5-mini`). (3) Two surfaces: a PWA chat drawer (orchestrator + agents, internal) and a public MCP server (Lambda Function URL + Streamable HTTP transport, OAuth 2.1 via Cognito).

**Tech Stack:** AWS Amplify Gen 2, Cognito (auth + OAuth 2.1 IdP), AppSync (GraphQL CRUD), DynamoDB (data), Lambda (functions), Lambda Function URL with `RESPONSE_STREAM` (chat orchestrator + MCP server), S3 (exports + AI logs), Secrets Manager (OpenAI key; Google OAuth secret added in Phase 7), CloudWatch (alarms). OpenAI SDK `openai` (agent reasoning + extraction; chat completions + function calling), `@modelcontextprotocol/sdk` (MCP server), `zod` (tool schemas), `vitest` (tests).

**Spec:** [`docs/superpowers/specs/2026-04-25-backend-design-v2.md`](../specs/2026-04-25-backend-design-v2.md)

**Supersedes:** [`plan v1`](./2026-04-25-backend-implementation.md). Phase 1 (frontend Vite migration) is unchanged from v1 and referenced rather than duplicated.

---

## Pre-flight Checklist

- [ ] AWS account with admin/power-user IAM credentials (`aws configure`).
- [ ] OpenAI API key, monthly budget cap set in OpenAI dashboard (recommend $20/mo for portfolio scale).
- [ ] Node.js 20+ (`node --version`).
- [ ] Project pushed to a GitHub repo (needed for Amplify Hosting in Phase 7).
- [ ] (Optional, defer to Phase 7) Google OAuth client + custom domain for the public MCP server URL.

---

## Final File Structure

```
leetcode/
├── frontend/                      (Vite SPA — see plan v1 Phase 1)
│   └── src/
│       ├── components/
│       │   ├── ChatDrawer.jsx     NEW (Phase 6)
│       │   ├── ChatMessage.jsx    NEW
│       │   ├── ToolCallCard.jsx   NEW
│       │   └── ... (existing components)
│       ├── lib/
│       │   ├── chat.js            NEW (SSE-over-fetch client)
│       │   └── ...
│       └── ...
├── backend/                       NEW (all backend code here)
│   ├── package.json
│   ├── tsconfig.json
│   ├── tools/                     (Phase 3)
│   │   ├── _types.ts              (ToolContext, common schemas)
│   │   ├── add-problem.ts
│   │   ├── update-problem.ts
│   │   ├── delete-problem.ts
│   │   ├── list-problems.ts
│   │   ├── get-problem.ts
│   │   ├── analyze-profile.ts
│   │   ├── suggest-next-problem.ts
│   │   ├── generate-study-plan.ts
│   │   ├── daily-summary.ts
│   │   ├── data/
│   │   │   └── problem-bank.json  (curated problems for suggest_next)
│   │   ├── index.ts               (re-exports + tool registry)
│   │   └── __tests__/
│   │       └── *.test.ts          (one per tool)
│   ├── agents/                    (Phase 4)
│   │   ├── _shared.ts             (OpenAI client, agent loop helper)
│   │   ├── curator.ts
│   │   ├── analyst.ts
│   │   ├── planner.ts
│   │   └── orchestrator.ts        (intent-classifier router + chain)
│   ├── auth/
│   │   ├── resource.ts            (Phase 2)
│   │   └── post-confirmation/     (Phase 2)
│   │       ├── resource.ts
│   │       └── handler.ts
│   ├── data/
│   │   └── resource.ts            (Phase 2: User, Problem, RateLimit, ChatSession)
│   ├── functions/                 (Lambda entry-points wrapping agents/tools)
│   │   ├── chat-stream/           (Phase 6: orchestrator HTTP entry)
│   │   │   ├── resource.ts
│   │   │   └── handler.ts
│   │   ├── mcp-server/            (Phase 5)
│   │   │   ├── resource.ts
│   │   │   ├── handler.ts
│   │   │   ├── oauth-metadata.ts
│   │   │   └── dcr-shim.ts
│   │   ├── post-confirmation/     (re-export from auth/)
│   │   └── export-data/           (Phase 2)
│   ├── storage/
│   │   └── resource.ts            (Phase 2: exports + ai-logs S3 buckets)
│   └── monitoring/
│       └── resource.ts            (Phase 7: CloudWatch alarms)
├── amplify/
│   ├── package.json
│   ├── tsconfig.json
│   └── backend.ts                 (1-line CLI shim that imports from ../backend/)
├── amplify.yml                    (Phase 7)
└── docs/
    └── superpowers/
        ├── specs/
        │   ├── 2026-04-25-backend-design.md       (v1, retained)
        │   └── 2026-04-25-backend-design-v2.md    (v2, current)
        └── plans/
            ├── 2026-04-25-backend-implementation.md       (v1, superseded)
            └── 2026-04-25-backend-implementation-v2.md    (v2, current — this file)
```

---

## Phase 1: Frontend Bundler Migration

**Status:** Reuse plan v1 Phase 1 verbatim. Vite migration is independent of v2's multi-agent scope. Complete tasks 1.1 through 1.8 from plan v1, then proceed.

After Phase 1: the existing PWA renders identically to today, but is bundled by Vite and ready to consume `aws-amplify`.

---

## Phase 2: Amplify Base + `backend/` Scaffolding

> Goal: Deploy Cognito + DynamoDB schema + S3 buckets to a sandbox. No agents, no MCP, no Lambdas yet beyond `postConfirmation` and `exportData`. After this phase, the app's mock data can be replaced with real GraphQL CRUD against the new tables.

### Task 2.1: Create `backend/` folder and Amplify shim

**Files:**
- Create: `backend/package.json`, `backend/tsconfig.json`
- Modify: root `package.json` (add `amplify` and `backend` dev deps)
- Create: `amplify/backend.ts` (CLI shim)
- Create: `amplify/package.json`, `amplify/tsconfig.json`

- [ ] **Step 1: Create `backend/package.json`**

```json
{
  "name": "leetcode-tracker-backend",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@aws-amplify/backend": "^1.5.0",
    "@aws-sdk/client-dynamodb": "^3.700.0",
    "@aws-sdk/client-s3": "^3.700.0",
    "@aws-sdk/client-secrets-manager": "^3.700.0",
    "@aws-sdk/lib-dynamodb": "^3.700.0",
    "@aws-sdk/s3-request-presigner": "^3.700.0",
    "openai": "^4.70.0",
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.23.0",
    "zod-to-json-schema": "^3.23.0"
  },
  "devDependencies": {
    "@types/aws-lambda": "^8.10.140",
    "@types/node": "^20.14.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `backend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "outDir": "./dist"
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create the Amplify CLI shim `amplify/backend.ts`**

```ts
// This file is a 1-line shim; the real backend code lives under ../backend/.
// Amplify Gen 2's `npx ampx` CLI hard-codes amplify/ as the entry point,
// so we keep this file present and import from where the code actually lives.
import { defineBackend } from "@aws-amplify/backend";

import { auth } from "../backend/auth/resource.js";
import { data } from "../backend/data/resource.js";
import { exportsBucket, aiLogsBucket } from "../backend/storage/resource.js";
import { exportData } from "../backend/functions/export-data/resource.js";
// Phase 4–7 add: extractProblem, agents Lambdas, mcpServer, chatStream

export const backend = defineBackend({
  auth,
  data,
  exportsBucket,
  aiLogsBucket,
  exportData
});
```

- [ ] **Step 4: Create `amplify/package.json`**

```json
{
  "name": "leetcode-tracker-amplify-shim",
  "private": true,
  "type": "module",
  "dependencies": {
    "@aws-amplify/backend": "^1.5.0",
    "@aws-amplify/backend-cli": "^1.4.0"
  }
}
```

- [ ] **Step 5: Create `amplify/tsconfig.json`**

```json
{
  "extends": "../backend/tsconfig.json",
  "include": ["./**/*.ts", "../backend/**/*.ts"]
}
```

- [ ] **Step 6: Install both packages**

```bash
cd /Users/boyangwang/leetcode
(cd backend && npm install)
(cd amplify && npm install)
```

Expected: both `node_modules/` directories created with no errors.

- [ ] **Step 7: Update root `.gitignore`**

```
node_modules/
.amplify/
amplify_outputs.json
```

- [ ] **Step 8: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/tsconfig.json
git add amplify/backend.ts amplify/package.json amplify/package-lock.json amplify/tsconfig.json
git add .gitignore
git commit -m "feat(backend): scaffold backend/ folder + amplify/ CLI shim"
```

---

### Task 2.2: Define Cognito auth in `backend/auth/`

**Files:**
- Create: `backend/auth/resource.ts`
- Create: `backend/auth/post-confirmation/resource.ts`
- Create: `backend/auth/post-confirmation/handler.ts`

- [ ] **Step 1: Create `backend/auth/post-confirmation/handler.ts`**

```ts
import type { PostConfirmationTriggerHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler: PostConfirmationTriggerHandler = async (event) => {
  const userId = event.userName;
  const email = event.request.userAttributes.email;
  const tableName = process.env.USER_TABLE_NAME!;

  await ddb.send(new PutCommand({
    TableName: tableName,
    Item: {
      userId,
      email,
      displayName: email,
      dailyTarget: 3,
      createdAt: new Date().toISOString()
    },
    ConditionExpression: "attribute_not_exists(userId)"
  })).catch((err) => {
    if (err.name === "ConditionalCheckFailedException") return; // idempotent
    throw err;
  });

  return event;
};
```

- [ ] **Step 2: Create `backend/auth/post-confirmation/resource.ts`**

```ts
import { defineFunction } from "@aws-amplify/backend";

export const postConfirmation = defineFunction({
  name: "postConfirmation",
  entry: "./handler.ts",
  resourceGroupName: "auth"
});
```

- [ ] **Step 3: Create `backend/auth/resource.ts`**

```ts
import { defineAuth } from "@aws-amplify/backend";
import { postConfirmation } from "./post-confirmation/resource.js";

// v2 launch: email/password only — Cognito stores password hashes, the developer never sees passwords.
// Google OAuth federation is wired in Phase 7 (separate commit) once the Google Cloud client is set up.
export const auth = defineAuth({
  loginWith: {
    email: true
  },
  userAttributes: {
    email: { required: true, mutable: false }
  },
  triggers: { postConfirmation }
});
```

- [ ] **Step 4: Update `amplify/backend.ts`** to grant the trigger access:

Append to `amplify/backend.ts` after `defineBackend`:

```ts
backend.data.resources.tables["User"].grantWriteData(
  backend.auth.resources.userPool.node.findChild("postConfirmation") as any
);
(backend.auth.resources.userPool.node.findChild("postConfirmation") as any)
  .addEnvironment("USER_TABLE_NAME", backend.data.resources.tables["User"].tableName);
```

> **Implementer note:** Amplify Gen 2's API for cross-resource grants on auth triggers has shifted across releases. If the above doesn't compile, the canonical reference is the Amplify docs for "grant access to other resources". Intent: the postConfirmation Lambda gets `dynamodb:PutItem` on the User table, plus the `USER_TABLE_NAME` env var.

- [ ] **Step 5: Commit**

```bash
git add backend/auth/ amplify/backend.ts
git commit -m "feat(backend/auth): Cognito email/password + post-confirmation trigger (Google federation deferred to Phase 7)"
```

---

### Task 2.3: Define data schema in `backend/data/`

**Files:**
- Create: `backend/data/resource.ts`

- [ ] **Step 1: Create `backend/data/resource.ts`**

```ts
import { type ClientSchema, a, defineData } from "@aws-amplify/backend";

const schema = a.schema({
  Difficulty: a.enum(["EASY", "MEDIUM", "HARD"]),

  User: a
    .model({
      userId: a.id().required(),
      email: a.email().required(),
      displayName: a.string(),
      dailyTarget: a.integer().required().default(3),
      createdAt: a.datetime().required()
    })
    .identifier(["userId"])
    .authorization((allow) => [allow.ownerDefinedIn("userId")]),

  Problem: a
    .model({
      id: a.id().required(),
      userId: a.id().required(),
      number: a.integer().required(),
      title: a.string().required(),
      difficulty: a.ref("Difficulty").required(),
      tags: a.string().array().required(),
      solvedAt: a.datetime().required(),
      description: a.string(),
      constraints: a.string().array(),
      solutions: a.json(),
      note: a.string()
    })
    .identifier(["id"])
    .secondaryIndexes((idx) => [idx("userId").sortKeys(["solvedAt"]).name("byUserAndDate")])
    .authorization((allow) => [allow.ownerDefinedIn("userId")]),

  RateLimit: a
    .model({
      userId: a.id().required(),
      dayKey: a.string().required(),
      aiCallCount: a.integer().required().default(0),
      mcpToolCount: a.integer().required().default(0),
      ttl: a.timestamp()
    })
    .identifier(["userId", "dayKey"])
    .authorization((allow) => [allow.authenticated().to([])]), // Lambda-only via IAM

  ChatSession: a
    .model({
      id: a.id().required(),
      userId: a.id().required(),
      agentRoute: a.string().required(),
      messages: a.json().required(),
      createdAt: a.datetime().required(),
      updatedAt: a.datetime().required()
    })
    .identifier(["id"])
    .secondaryIndexes((idx) => [idx("userId").sortKeys(["updatedAt"]).name("byUserAndUpdated")])
    .authorization((allow) => [allow.ownerDefinedIn("userId")])
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: { defaultAuthorizationMode: "userPool" }
});
```

- [ ] **Step 2: Commit**

```bash
git add backend/data/resource.ts
git commit -m "feat(backend/data): User, Problem (byUserAndDate GSI), RateLimit, ChatSession models"
```

---

### Task 2.4: Define S3 storage in `backend/storage/`

**Files:**
- Create: `backend/storage/resource.ts`
- Modify: `amplify/backend.ts`

- [ ] **Step 1: Create `backend/storage/resource.ts`**

```ts
import { defineStorage } from "@aws-amplify/backend";

export const exportsBucket = defineStorage({
  name: "exports",
  access: (allow) => ({
    "{userId}/exports/*": [allow.entity("identity").to(["read"])]
  })
});

export const aiLogsBucket = defineStorage({
  name: "aiLogs",
  isDefault: false,
  access: () => ({}) // Lambda-only via IAM grants in backend.ts
});
```

- [ ] **Step 2: Append to `amplify/backend.ts`**

```ts
// Lifecycle rules
backend.aiLogsBucket.resources.bucket.addLifecycleRule({
  id: "expire-ai-logs",
  enabled: true,
  expiration: { days: 90 } as any,
  transitions: [{ storageClass: "STANDARD_IA" as any, transitionAfter: { days: 30 } as any }]
});
backend.exportsBucket.resources.bucket.addLifecycleRule({
  id: "expire-exports",
  enabled: true,
  expiration: { days: 30 } as any
});
```

- [ ] **Step 3: Commit**

```bash
git add backend/storage/ amplify/backend.ts
git commit -m "feat(backend/storage): exports + ai-logs S3 buckets with lifecycle policies"
```

---

### Task 2.5: Implement `exportData` Lambda in `backend/functions/`

(Same as v1 plan task 2.6 but in `backend/functions/export-data/` instead of `amplify/functions/export-data/`. Refer to v1 plan for full code.)

After this task, sandbox has all base infra ready: Cognito, DynamoDB, S3, exportData function. Smoke-test with `npx ampx sandbox` from project root.

- [ ] **Step 1–4:** Copy `handler.ts` and `resource.ts` from v1 plan, update import paths to use `backend/` paths.

- [ ] **Step 5: Sandbox deploy and verify**

```bash
cd /Users/boyangwang/leetcode
npx ampx sandbox
```

Expected: stack deploys; `amplify_outputs.json` written. Manually create a test user in Cognito console, verify a `User` row appears in DynamoDB, verify `exportMyData` mutation returns a signed URL.

- [ ] **Step 6: Commit**

```bash
git add backend/functions/export-data/ amplify/backend.ts backend/data/resource.ts
git commit -m "feat(backend): exportMyData mutation + Lambda"
```

---

## Phase 3: Shared Tools Layer

> Goal: Implement all 9 tools as pure TypeScript functions with zod schemas. Each tool is unit-tested in isolation. After this phase, the agent layer (Phase 4) and the MCP server (Phase 5) both consume these.

### Task 3.1: Define `ToolContext` and shared types

**Files:**
- Create: `backend/tools/_types.ts`

- [ ] **Step 1: Create `backend/tools/_types.ts`**

```ts
import { z } from "zod";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import OpenAI from "openai";

export interface ToolContext {
  userId: string;
  ddb: DynamoDBDocumentClient;
  s3: S3Client;
  openai: OpenAI;
  env: {
    PROBLEM_TABLE: string;
    USER_TABLE: string;
    RATELIMIT_TABLE: string;
    AI_LOGS_BUCKET: string;
    EXPORTS_BUCKET: string;
    OPENAI_MODEL_EXTRACTION: string;
    OPENAI_MODEL_REASONING: string;
    OPENAI_MODEL_INTENT: string;
    AI_DAILY_RATE_LIMIT: number;
    MCP_TOOL_DAILY_LIMIT: number;
  };
}

export const ProblemSchema = z.object({
  id: z.string(),
  userId: z.string(),
  number: z.number().int().positive(),
  title: z.string(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
  tags: z.array(z.string()),
  solvedAt: z.string().datetime(),
  description: z.string().nullable(),
  constraints: z.array(z.string()).nullable(),
  solutions: z.record(z.string()).nullable(),
  note: z.string().nullable()
});

export type Problem = z.infer<typeof ProblemSchema>;

// Each tool exports its definition in this shape
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

- [ ] **Step 2: Commit**

```bash
git add backend/tools/_types.ts
git commit -m "feat(backend/tools): ToolContext, ProblemSchema, ToolDefinition contract"
```

---

### Task 3.2: Implement `add_problem` (only tool with internal LLM call)

**Files:**
- Create: `backend/tools/add-problem.ts`
- Create: `backend/tools/__tests__/add-problem.test.ts`
- Create: `backend/tools/_openai-extraction.ts` (extracted prompt + function schema)

This is the v1 `extractProblem` Lambda's logic, refactored as a pure function inside the tool layer.

- [ ] **Step 1: Create `backend/tools/_openai-extraction.ts`**

```ts
export const EXTRACTION_SYSTEM_PROMPT = `You are a Leetcode problem identifier. Given a code solution, identify:

1. The Leetcode problem number and exact title.
2. Difficulty (EASY, MEDIUM, or HARD).
3. Algorithmic tags (e.g. "array", "hash-map", "dp", "two-pointer", "graph", "dfs", "bfs", "sliding-window"). kebab-case, lowercase, 1-5 tags.
4. A brief problem description (2-4 sentences).
5. Key constraints (3-6 short bullets).
6. The programming language of the solution (one of: python, cpp, java, other).

Call the record_extraction function. If you cannot identify the problem with high confidence, set confidence to "low".`;

export const EXTRACTION_FUNCTION_SCHEMA = {
  type: "object" as const,
  properties: {
    number: { type: "integer" },
    title: { type: "string" },
    difficulty: { type: "string", enum: ["EASY", "MEDIUM", "HARD"] },
    tags: { type: "array", items: { type: "string" } },
    description: { type: "string" },
    constraints: { type: "array", items: { type: "string" } },
    language: { type: "string", enum: ["python", "cpp", "java", "other"] },
    confidence: { type: "string", enum: ["high", "low"] }
  },
  required: ["number", "title", "difficulty", "tags", "description", "language", "confidence"],
  additionalProperties: false
} as const;

export const EXTRACTION_TOOL_DEFINITION = {
  type: "function" as const,
  function: {
    name: "record_extraction",
    description: "Record the extracted Leetcode problem metadata.",
    parameters: EXTRACTION_FUNCTION_SCHEMA
  }
};
```

- [ ] **Step 2: Write the failing test (`backend/tools/__tests__/add-problem.test.ts`)**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ToolContext } from "../_types.js";

describe("addProblem tool", () => {
  let ctx: ToolContext;
  let ddbSend: any;
  let s3Send: any;
  let openaiCreate: any;

  beforeEach(() => {
    ddbSend = vi.fn();
    s3Send = vi.fn().mockResolvedValue({});
    openaiCreate = vi.fn();
    ctx = {
      userId: "user-1",
      ddb: { send: ddbSend } as any,
      s3: { send: s3Send } as any,
      openai: { chat: { completions: { create: openaiCreate } } } as any,
      env: {
        PROBLEM_TABLE: "P", USER_TABLE: "U", RATELIMIT_TABLE: "R",
        AI_LOGS_BUCKET: "ai", EXPORTS_BUCKET: "ex",
        OPENAI_MODEL_EXTRACTION: "gpt-5",
        OPENAI_MODEL_REASONING: "gpt-5",
        OPENAI_MODEL_INTENT: "gpt-5-mini",
        AI_DAILY_RATE_LIMIT: 50,
        MCP_TOOL_DAILY_LIMIT: 200
      }
    };
  });

  it("rejects with RATE_LIMIT_EXCEEDED when daily cap reached", async () => {
    ddbSend.mockRejectedValueOnce(Object.assign(new Error("over"), { name: "ConditionalCheckFailedException" }));
    const { addProblem } = await import("../add-problem.js");
    await expect(addProblem(ctx, { solutionText: "code" })).rejects.toThrow(/RATE_LIMIT_EXCEEDED/);
  });

  it("routes the solution into the language slot returned by the model", async () => {
    ddbSend
      .mockResolvedValueOnce({}) // rate limit update
      .mockResolvedValueOnce({}); // PutItem
    openaiCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{
            id: "call_1",
            type: "function",
            function: {
              name: "record_extraction",
              arguments: JSON.stringify({
                number: 1, title: "Two Sum", difficulty: "EASY",
                tags: ["array"], description: "...", constraints: [],
                language: "cpp", confidence: "high"
              })
            }
          }]
        },
        finish_reason: "tool_calls"
      }]
    });
    const { addProblem } = await import("../add-problem.js");
    const result = await addProblem(ctx, { solutionText: "vector<int> twoSum() {}" });
    expect(result.solutions?.cpp).toBe("vector<int> twoSum() {}");
    expect(result.solutions?.python).toBe("");
    expect(result.title).toBe("Two Sum");
  });

  it("rolls back the rate limit increment on OpenAI 5xx", async () => {
    ddbSend
      .mockResolvedValueOnce({}) // rate limit increment
      .mockResolvedValueOnce({}); // rollback decrement
    openaiCreate.mockRejectedValueOnce(Object.assign(new Error("server error"), { status: 500 }));
    const { addProblem } = await import("../add-problem.js");
    await expect(addProblem(ctx, { solutionText: "code" })).rejects.toThrow(/AI_SERVICE_UNAVAILABLE/);
    expect(ddbSend).toHaveBeenCalledTimes(2);
    const decrementCall = ddbSend.mock.calls[1][0];
    expect(decrementCall.input.UpdateExpression).toContain("ADD aiCallCount :neg");
  });
});
```

- [ ] **Step 3: Run the failing test**

```bash
cd backend && npx vitest run tools/__tests__/add-problem.test.ts
```

Expected: 3 failures (module not yet implemented).

- [ ] **Step 4: Implement `backend/tools/add-problem.ts`**

```ts
import { z } from "zod";
import { UpdateCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ToolContext, ToolDefinition } from "./_types.js";
import { ProblemSchema } from "./_types.js";
import { EXTRACTION_SYSTEM_PROMPT, EXTRACTION_TOOL_DEFINITION } from "./_openai-extraction.js";

export const AddProblemInput = z.object({
  solutionText: z.string().min(10).max(50000)
});
export type AddProblemInput = z.infer<typeof AddProblemInput>;

const ExtractionResult = z.object({
  number: z.number().int().positive(),
  title: z.string().min(1),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
  tags: z.array(z.string()).min(1).max(8),
  description: z.string(),
  constraints: z.array(z.string()).default([]),
  language: z.enum(["python", "cpp", "java", "other"]),
  confidence: z.enum(["high", "low"])
});

export async function addProblem(ctx: ToolContext, input: AddProblemInput) {
  const { solutionText } = AddProblemInput.parse(input);
  const dayKey = new Date().toISOString().slice(0, 10);
  const ttl = Math.floor(Date.now() / 1000) + 7 * 86400;

  // 1. Atomic rate-limit increment
  try {
    await ctx.ddb.send(new UpdateCommand({
      TableName: ctx.env.RATELIMIT_TABLE,
      Key: { userId: ctx.userId, dayKey },
      UpdateExpression: "ADD aiCallCount :one SET #ttl = :ttl",
      ConditionExpression: "attribute_not_exists(aiCallCount) OR aiCallCount < :max",
      ExpressionAttributeNames: { "#ttl": "ttl" },
      ExpressionAttributeValues: { ":one": 1, ":ttl": ttl, ":max": ctx.env.AI_DAILY_RATE_LIMIT }
    }));
  } catch (err: any) {
    if (err.name === "ConditionalCheckFailedException") throw new Error("RATE_LIMIT_EXCEEDED");
    throw err;
  }

  // 2. OpenAI extraction (chat completions + forced function call)
  const requestId = randomUUID();
  const requestPayload = {
    model: ctx.env.OPENAI_MODEL_EXTRACTION,
    max_tokens: 1024,
    messages: [
      { role: "system" as const, content: EXTRACTION_SYSTEM_PROMPT },
      { role: "user" as const, content: solutionText }
    ],
    tools: [EXTRACTION_TOOL_DEFINITION],
    tool_choice: { type: "function" as const, function: { name: "record_extraction" } }
  };

  let response: any;
  try {
    response = await ctx.openai.chat.completions.create(requestPayload as any, { timeout: 15000 } as any);
  } catch (err: any) {
    // Roll back rate limit on infra failure (5xx, 429, timeout) — not on parse error.
    if ((err.status >= 500) || err.status === 429 || err.name === "TimeoutError" || err.name === "APIConnectionTimeoutError") {
      await ctx.ddb.send(new UpdateCommand({
        TableName: ctx.env.RATELIMIT_TABLE,
        Key: { userId: ctx.userId, dayKey },
        UpdateExpression: "ADD aiCallCount :neg",
        ExpressionAttributeValues: { ":neg": -1 }
      })).catch(() => {});
      throw new Error("AI_SERVICE_UNAVAILABLE");
    }
    throw err;
  }

  const toolCall = response.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.function?.name !== "record_extraction") {
    throw new Error("AI_INVALID_RESPONSE");
  }

  let extraction: z.infer<typeof ExtractionResult>;
  try {
    const parsed = JSON.parse(toolCall.function.arguments);
    extraction = ExtractionResult.parse(parsed);
  } catch {
    throw new Error("AI_INVALID_RESPONSE");
  }

  // 3. Persist Problem
  const id = randomUUID();
  const lang = extraction.language === "other" ? "python" : extraction.language;
  const solutions: Record<string, string> = { python: "", cpp: "", java: "" };
  solutions[lang] = solutionText;
  const now = new Date().toISOString();
  const item = {
    id, userId: ctx.userId,
    number: extraction.number,
    title: extraction.title,
    difficulty: extraction.difficulty,
    tags: extraction.tags,
    solvedAt: now,
    description: extraction.description,
    constraints: extraction.constraints,
    solutions,
    note: "",
    createdAt: now,
    updatedAt: now,
    __typename: "Problem",
    owner: ctx.userId
  };

  try {
    await ctx.ddb.send(new PutCommand({
      TableName: ctx.env.PROBLEM_TABLE,
      Item: item,
      ConditionExpression: "attribute_not_exists(id)"
    }));
  } catch {
    throw new Error("PERSIST_FAILED");
  }

  // 4. Fire-and-forget AI log to S3
  ctx.s3.send(new PutObjectCommand({
    Bucket: ctx.env.AI_LOGS_BUCKET,
    Key: `${dayKey.replace(/-/g, "/")}/${ctx.userId}/${requestId}.json`,
    Body: JSON.stringify({ requestId, userId: ctx.userId, request: requestPayload, response, extraction }),
    ContentType: "application/json"
  })).catch((e) => console.error("ai-log put failed", e));

  return ProblemSchema.parse(item);
}

export const addProblemTool: ToolDefinition<AddProblemInput, ReturnType<typeof addProblem> extends Promise<infer R> ? R : never> = {
  name: "add_problem",
  description: "Extract Leetcode problem metadata from pasted code via OpenAI, then persist a new tile in the user's tracker.",
  inputSchema: AddProblemInput,
  outputSchema: ProblemSchema,
  execute: addProblem,
  jsonSchema: zodToJsonSchema(AddProblemInput) as object
};
```

- [ ] **Step 5: Run tests until they pass**

```bash
cd backend && npx vitest run tools/__tests__/add-problem.test.ts
```

Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/tools/_openai-extraction.ts backend/tools/add-problem.ts backend/tools/__tests__/add-problem.test.ts
git commit -m "feat(backend/tools): add_problem tool with rate limiting, Claude extraction, language routing"
```

---

### Task 3.3: Implement remaining 8 tools

For each tool, the structure is identical: `input zod schema` + `output zod schema` + `execute(ctx, input)` + `ToolDefinition` export. All eight share the pattern from `add-problem.ts` minus the OpenAI call.

For each: write a failing test → implement → green → commit.

The implementations are CRUD wrappers; full code in this plan would balloon length. Sketches:

#### 3.3.1 `update-problem.ts`

- Input: `{ id, fields: { tags?, note?, difficulty? } }`
- Logic: `UpdateCommand` against Problem table with `ConditionExpression: "userId = :u"` to enforce ownership
- Output: updated Problem
- Test: success path; ownership rejection; field validation

#### 3.3.2 `delete-problem.ts`

- Input: `{ id }`
- Logic: `DeleteCommand` against Problem table, `ConditionExpression: "userId = :u"`
- Output: `{ deletedId: string }`
- Test: success; ownership rejection

#### 3.3.3 `list-problems.ts`

- Input: `{ filter?: { tags?, difficulty?, dateFrom?, dateTo? }, limit?, cursor? }`
- Logic: `QueryCommand` on `byUserAndDate` GSI; `ExclusiveStartKey: cursor`; post-filter for `tags` (DynamoDB doesn't filter array intersection efficiently)
- Output: `{ items: Problem[], cursor?: string }`
- Test: pagination; tag filter; difficulty filter; date range

#### 3.3.4 `get-problem.ts`

- Input: `{ id }`
- Logic: `GetCommand` on Problem table; verify ownership
- Output: Problem
- Test: hit; miss returns NOT_FOUND; ownership rejection

#### 3.3.5 `analyze-profile.ts`

- Input: `{ window: "week" | "month" | "all" }`
- Logic: pure function over the result of `listProblems` (call internally) — compute tag distribution, difficulty distribution, derive weak/strong areas
- Output: `{ totalProblems, byTag: Record<string, number>, byDifficulty: { EASY, MEDIUM, HARD }, weakAreas: string[], strongAreas: string[], windowStart: string, windowEnd: string }`
- Heuristic: weak area = tag with < 5% coverage relative to a reference distribution from the problem-bank; strong = top 3 by frequency
- Test: empty input; small dataset; large dataset

#### 3.3.6 `suggest-next-problem.ts`

- Input: `{ focus?: string }` (optional tag)
- Logic: load `data/problem-bank.json`; subtract problems user has already done (by `number`); rank by tag-coverage gap (or by `focus` match if provided); return top 1 with rationale
- Output: `{ suggestion: { number, title, difficulty, tags, url? }, rationale: string }`
- Test: empty user history; focus tag; all bank problems already done

#### 3.3.7 `generate-study-plan.ts`

- Input: `{ days: number, focus?: string }`
- Logic: call `analyzeProfile` once + iteratively call `suggestNextProblem` `days` times (excluding earlier picks); package as `[{ day: 1, problem, rationale }, ...]`
- Output: `{ plan: DayPlan[], summary: string }`
- Test: 3-day plan; 7-day plan; with and without focus

#### 3.3.8 `daily-summary.ts`

- Input: `{ date?: string (ISO date, default today) }`
- Logic: `listProblems` filtered to single day; format
- Output: `{ date, count, tagsCovered, problems: ProblemBrief[], summary: string }`
- Test: empty day; busy day

For each subtask:

- [ ] Write failing test in `backend/tools/__tests__/<tool>.test.ts`
- [ ] Run test, see it fail
- [ ] Implement `backend/tools/<tool>.ts`
- [ ] Run test, see it pass
- [ ] Commit

---

### Task 3.4: Curate `backend/tools/data/problem-bank.json`

**Files:**
- Create: `backend/tools/data/problem-bank.json`

A static JSON of ~150 well-known Leetcode problems with the schema:

```json
[
  {
    "number": 1,
    "title": "Two Sum",
    "difficulty": "EASY",
    "tags": ["array", "hash-map"],
    "url": "https://leetcode.com/problems/two-sum/",
    "prerequisiteTags": []
  },
  {
    "number": 207,
    "title": "Course Schedule",
    "difficulty": "MEDIUM",
    "tags": ["graph", "topological-sort"],
    "url": "https://leetcode.com/problems/course-schedule/",
    "prerequisiteTags": ["graph", "dfs"]
  }
]
```

- [ ] **Step 1: Seed the bank with the entries from `frontend/src/lib/sample-data.js` (FAKE_BANK)** — those are already curated. Add `url` and `prerequisiteTags` fields.

- [ ] **Step 2: Augment to ~150 entries** — pick coverage across tags: array, string, dp, graph, tree, heap, two-pointer, sliding-window, binary-search, greedy, backtracking, design.

- [ ] **Step 3: Commit**

```bash
git add backend/tools/data/problem-bank.json
git commit -m "feat(backend/tools): seed curated problem-bank.json (~150 problems)"
```

---

### Task 3.5: Tools index and registry

**Files:**
- Create: `backend/tools/index.ts`

- [ ] **Step 1: Create `backend/tools/index.ts`**

```ts
import { addProblemTool } from "./add-problem.js";
import { updateProblemTool } from "./update-problem.js";
import { deleteProblemTool } from "./delete-problem.js";
import { listProblemsTool } from "./list-problems.js";
import { getProblemTool } from "./get-problem.js";
import { analyzeProfileTool } from "./analyze-profile.js";
import { suggestNextProblemTool } from "./suggest-next-problem.js";
import { generateStudyPlanTool } from "./generate-study-plan.js";
import { dailySummaryTool } from "./daily-summary.js";
import type { ToolDefinition } from "./_types.js";

export const ALL_TOOLS: Record<string, ToolDefinition<any, any>> = {
  add_problem: addProblemTool,
  update_problem: updateProblemTool,
  delete_problem: deleteProblemTool,
  list_problems: listProblemsTool,
  get_problem: getProblemTool,
  analyze_profile: analyzeProfileTool,
  suggest_next_problem: suggestNextProblemTool,
  generate_study_plan: generateStudyPlanTool,
  daily_summary: dailySummaryTool
};

// OpenAI SDK-compatible tools array (function calling shape)
export const OPENAI_TOOLS = Object.values(ALL_TOOLS).map((t) => ({
  type: "function" as const,
  function: { name: t.name, description: t.description, parameters: t.jsonSchema }
}));

export function toolByName(name: string) {
  const tool = ALL_TOOLS[name];
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool;
}

export * from "./_types.js";
```

- [ ] **Step 2: Commit**

```bash
git add backend/tools/index.ts
git commit -m "feat(backend/tools): export ALL_TOOLS registry + OpenAI tool array"
```

---

## Phase 4: Agent Layer

> Goal: Implement Curator, Analyst, Planner, and Orchestrator. Each agent is a function `(ctx, message, history) → AsyncIterable<AgentEvent>` that streams events. After this phase, agents are testable in isolation; Phase 6 wires them into a Lambda + chat drawer.

### Task 4.1: Implement `_shared.ts` agent loop helper

**Files:**
- Create: `backend/agents/_shared.ts`

This file contains the shared "agent loop": call OpenAI with `tools:[{type:"function",...}]`, execute any tool calls, feed results back as `{role:"tool"}` messages, repeat until the model returns a message with no `tool_calls` or hit the max-tool-calls cap.

- [ ] **Step 1: Create `backend/agents/_shared.ts`**

```ts
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

export async function* runAgent(
  ctx: ToolContext,
  args: {
    name: string;
    systemPrompt: string;
    allowedTools: string[];
    model: string;
    history: AgentMessage[];
    userMessage: string;
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

  const messages: any[] = [
    { role: "system", content: args.systemPrompt },
    ...args.history.map((m) => ({ role: m.role, content: m.content, tool_calls: m.tool_calls, tool_call_id: m.tool_call_id })),
    { role: "user", content: args.userMessage }
  ];

  let iter = 0;
  while (iter < MAX_TOOL_CALLS) {
    if (Date.now() - start > AGENT_TIMEOUT_MS) throw new Error("AGENT_TIMEOUT");
    iter++;

    const resp = await ctx.openai.chat.completions.create({
      model: args.model,
      max_tokens: 2048,
      tools: tools as any,
      messages
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
```

- [ ] **Step 2: Unit test the agent loop**

Create `backend/agents/__tests__/_shared.test.ts` with a test that:
- Mocks `openai.chat.completions.create` to return one tool_call, then on the second call return a content-only response with `finish_reason: "stop"`.
- Mocks `toolByName` to return a stub tool that records its invocation.
- Asserts the events emitted in order: `thinking` (if any text in first turn), `tool_call`, `tool_result`, `thinking` (final), `done`.

- [ ] **Step 3: Run test, see green**

```bash
cd backend && npx vitest run agents/__tests__/_shared.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add backend/agents/_shared.ts backend/agents/__tests__/_shared.test.ts
git commit -m "feat(backend/agents): runAgent loop with tool-use, max-call cap, timeout"
```

---

### Task 4.2: Implement Curator, Analyst, Planner agents

**Files:**
- Create: `backend/agents/curator.ts`
- Create: `backend/agents/analyst.ts`
- Create: `backend/agents/planner.ts`

Each is a 30-line file: system prompt + allowed-tool list + a function that wraps `runAgent`.

- [ ] **Step 1: Create `backend/agents/curator.ts`**

```ts
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
```

- [ ] **Step 2: Create `backend/agents/analyst.ts`**

```ts
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
```

- [ ] **Step 3: Create `backend/agents/planner.ts`**

```ts
import type { ToolContext } from "../tools/_types.js";
import { runAgent, type AgentMessage, type AgentEvent } from "./_shared.js";

const SYSTEM_PROMPT = `You are a Leetcode study coach. Use tools to inspect the user's history and recommend the next problem or generate a multi-day study plan.

Behavior:
- For "what should I do next", call \`analyze_profile\` then \`suggest_next_problem\`.
- For multi-day plans, call \`generate_study_plan\` directly.
- Always justify each recommendation by the tag coverage gap or stated focus area.
- Use problem numbers (#207, #146) so the user can find the problems on Leetcode.`;

const ALLOWED_TOOLS = ["list_problems", "analyze_profile", "suggest_next_problem", "generate_study_plan"];

export function runPlanner(
  ctx: ToolContext, history: AgentMessage[], userMessage: string
): AsyncIterable<AgentEvent> {
  return runAgent(ctx, {
    name: "planner",
    systemPrompt: SYSTEM_PROMPT,
    allowedTools: ALLOWED_TOOLS,
    model: ctx.env.OPENAI_MODEL_REASONING,
    history, userMessage
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add backend/agents/curator.ts backend/agents/analyst.ts backend/agents/planner.ts
git commit -m "feat(backend/agents): Curator, Analyst, Planner specialized agents"
```

---

### Task 4.3: Implement Orchestrator (intent classifier + chaining)

**Files:**
- Create: `backend/agents/orchestrator.ts`

- [ ] **Step 1: Create `backend/agents/orchestrator.ts`**

```ts
import type { ToolContext } from "../tools/_types.js";
import { runCurator } from "./curator.js";
import { runAnalyst } from "./analyst.js";
import { runPlanner } from "./planner.js";
import type { AgentMessage, AgentEvent } from "./_shared.js";

type Route = "curator" | "analyst" | "planner" | "multi:analyst-then-planner";

const INTENT_SYSTEM_PROMPT = `Classify the user's request into one of:
- curator: adding/updating/deleting problems in their tracker (especially when they paste code)
- analyst: questions about their stats, history, or progress
- planner: asking for what to do next, recommendations, or multi-day study plans
- multi:analyst-then-planner: requests that combine analysis and planning ("analyze my weak areas and make a plan")

Return ONLY the route name, nothing else.`;

async function classifyIntent(ctx: ToolContext, userMessage: string, history: AgentMessage[]): Promise<Route> {
  const recentHistory = history.slice(-4).map((m) => `${m.role}: ${typeof m.content === "string" ? m.content : "[tool calls]"}`).join("\n");
  const resp = await ctx.openai.chat.completions.create({
    model: ctx.env.OPENAI_MODEL_INTENT,
    max_tokens: 50,
    messages: [
      { role: "system", content: INTENT_SYSTEM_PROMPT },
      { role: "user", content: `Recent history:\n${recentHistory}\n\nUser: ${userMessage}` }
    ]
  });
  const text = resp.choices[0]?.message?.content?.trim().toLowerCase() ?? "analyst";
  const valid: Route[] = ["curator", "analyst", "planner", "multi:analyst-then-planner"];
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
```

- [ ] **Step 2: Unit test the orchestrator's classifier**

Create `backend/agents/__tests__/orchestrator.test.ts` mocking `openai.chat.completions.create` to return each of the four routes (the assistant message `content` is the route name); assert the right sub-agent is invoked.

- [ ] **Step 3: Commit**

```bash
git add backend/agents/orchestrator.ts backend/agents/__tests__/orchestrator.test.ts
git commit -m "feat(backend/agents): orchestrator with intent classifier + multi-agent chaining"
```

---

## Phase 5: MCP Server

> Goal: A Lambda Function URL serving Streamable HTTP MCP, OAuth 2.1 protected via Cognito, exposing all 9 tools. After this phase, Claude Desktop can connect.

### Task 5.1: MCP server Lambda handler

**Files:**
- Create: `backend/functions/mcp-server/resource.ts`
- Create: `backend/functions/mcp-server/handler.ts`

- [ ] **Step 1: Create `backend/functions/mcp-server/resource.ts`**

```ts
import { defineFunction, secret } from "@aws-amplify/backend";

export const mcpServer = defineFunction({
  name: "mcpServer",
  entry: "./handler.ts",
  timeoutSeconds: 60,
  memoryMB: 1024,
  runtime: 20,
  environment: {
    OPENAI_API_KEY: secret("OPENAI_API_KEY"),
    COGNITO_USER_POOL_ID: "set-by-backend-ts",
    COGNITO_REGION: "us-east-1",
    AI_DAILY_RATE_LIMIT: "50",
    MCP_TOOL_DAILY_LIMIT: "200",
    OPENAI_MODEL_EXTRACTION: "gpt-5",
    OPENAI_MODEL_REASONING: "gpt-5",
    OPENAI_MODEL_INTENT: "gpt-5-mini"
  }
});
```

- [ ] **Step 2: Create `backend/functions/mcp-server/handler.ts`**

```ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import OpenAI from "openai";
import { ALL_TOOLS, toolByName, type ToolContext } from "../../tools/index.js";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const JWKS = createRemoteJWKSet(new URL(
  `https://cognito-idp.${process.env.COGNITO_REGION}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}/.well-known/jwks.json`
));

function buildContext(userId: string): ToolContext {
  return {
    userId, ddb, s3, openai,
    env: {
      PROBLEM_TABLE: process.env.PROBLEM_TABLE!,
      USER_TABLE: process.env.USER_TABLE!,
      RATELIMIT_TABLE: process.env.RATELIMIT_TABLE!,
      AI_LOGS_BUCKET: process.env.AI_LOGS_BUCKET!,
      EXPORTS_BUCKET: process.env.EXPORTS_BUCKET!,
      OPENAI_MODEL_EXTRACTION: process.env.OPENAI_MODEL_EXTRACTION!,
      OPENAI_MODEL_REASONING: process.env.OPENAI_MODEL_REASONING!,
      OPENAI_MODEL_INTENT: process.env.OPENAI_MODEL_INTENT!,
      AI_DAILY_RATE_LIMIT: parseInt(process.env.AI_DAILY_RATE_LIMIT!, 10),
      MCP_TOOL_DAILY_LIMIT: parseInt(process.env.MCP_TOOL_DAILY_LIMIT!, 10)
    }
  };
}

async function bumpMcpToolCount(ctx: ToolContext) {
  const dayKey = new Date().toISOString().slice(0, 10);
  const ttl = Math.floor(Date.now() / 1000) + 7 * 86400;
  try {
    await ctx.ddb.send(new UpdateCommand({
      TableName: ctx.env.RATELIMIT_TABLE,
      Key: { userId: ctx.userId, dayKey },
      UpdateExpression: "ADD mcpToolCount :one SET #ttl = :ttl",
      ConditionExpression: "attribute_not_exists(mcpToolCount) OR mcpToolCount < :max",
      ExpressionAttributeNames: { "#ttl": "ttl" },
      ExpressionAttributeValues: { ":one": 1, ":ttl": ttl, ":max": ctx.env.MCP_TOOL_DAILY_LIMIT }
    }));
  } catch (err: any) {
    if (err.name === "ConditionalCheckFailedException") throw new Error("MCP_RATE_LIMIT_EXCEEDED");
    throw err;
  }
}

function buildMcpServer(ctx: ToolContext) {
  const server = new Server({ name: "lc-tracker", version: "1.0.0" }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: Object.values(ALL_TOOLS).map((t) => ({
      name: t.name, description: t.description, inputSchema: t.jsonSchema
    }))
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    await bumpMcpToolCount(ctx);
    const tool = toolByName(req.params.name);
    const validated = tool.inputSchema.parse(req.params.arguments ?? {});
    const result = await tool.execute(ctx, validated);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  });

  return server;
}

// Lambda Function URL handler with response streaming.
// AWS_LWA-style: read the entire request, dispatch via MCP SDK, stream the response.
export const handler = awslambda.streamifyResponse(async (event: any, responseStream: any) => {
  const auth = event.headers?.authorization || event.headers?.Authorization;
  if (!auth?.startsWith("Bearer ")) {
    responseStream.setHeader("WWW-Authenticate", `Bearer realm="lc-tracker", error="invalid_token"`);
    responseStream.statusCode = 401;
    responseStream.end();
    return;
  }

  let userId: string;
  try {
    const { payload } = await jwtVerify(auth.slice(7), JWKS, {
      issuer: `https://cognito-idp.${process.env.COGNITO_REGION}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}`
    });
    userId = payload.sub as string;
  } catch {
    responseStream.statusCode = 401;
    responseStream.end();
    return;
  }

  const ctx = buildContext(userId);
  const mcpServer = buildMcpServer(ctx);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  await mcpServer.connect(transport);
  const body = event.body ? (event.isBase64Encoded ? Buffer.from(event.body, "base64").toString() : event.body) : "";
  const req = { headers: event.headers, method: event.requestContext?.http?.method ?? "POST", body };
  // The transport handles writing JSON-RPC responses to a Node stream.
  await transport.handleRequest(req as any, responseStream as any, body);
});

declare const awslambda: any;
```

> **Implementer note:** the `awslambda.streamifyResponse` API is Lambda's native response-streaming hook, available when the function has `InvokeMode: RESPONSE_STREAM`. The MCP SDK's `StreamableHTTPServerTransport` accepts a Node-style `req`/`res` pair; the adapter shape above is approximate. If the SDK version's signature differs, consult `@modelcontextprotocol/sdk` README — the conceptual flow (verify JWT → build context → dispatch through SDK) stays the same.

- [ ] **Step 3: Wire mcpServer in `amplify/backend.ts`**

```ts
import { mcpServer } from "../backend/functions/mcp-server/resource.js";

// add to defineBackend({...mcpServer})

backend.data.resources.tables["Problem"].grantReadWriteData(mcpServer);
backend.data.resources.tables["User"].grantReadData(mcpServer);
backend.data.resources.tables["RateLimit"].grantReadWriteData(mcpServer);
backend.aiLogsBucket.resources.bucket.grantWrite(mcpServer);

mcpServer.addEnvironment("PROBLEM_TABLE", backend.data.resources.tables["Problem"].tableName);
mcpServer.addEnvironment("USER_TABLE", backend.data.resources.tables["User"].tableName);
mcpServer.addEnvironment("RATELIMIT_TABLE", backend.data.resources.tables["RateLimit"].tableName);
mcpServer.addEnvironment("AI_LOGS_BUCKET", backend.aiLogsBucket.resources.bucket.bucketName);
mcpServer.addEnvironment("EXPORTS_BUCKET", backend.exportsBucket.resources.bucket.bucketName);
mcpServer.addEnvironment("COGNITO_USER_POOL_ID", backend.auth.resources.userPool.userPoolId);
mcpServer.addEnvironment("COGNITO_REGION", backend.auth.resources.userPool.stack.region);

// Configure Lambda Function URL with response streaming
const fnUrl = mcpServer.resources.lambda.addFunctionUrl({
  authType: "NONE" as any, // we handle JWT in code
  invokeMode: "RESPONSE_STREAM" as any,
  cors: {
    allowedOrigins: ["*"],
    allowedMethods: ["POST", "OPTIONS"] as any,
    allowedHeaders: ["authorization", "content-type", "mcp-session-id"]
  }
});
backend.addOutput({ custom: { mcpServerUrl: fnUrl.url } });
```

- [ ] **Step 4: Commit**

```bash
git add backend/functions/mcp-server/ amplify/backend.ts
git commit -m "feat(backend/mcp-server): Lambda Function URL with Streamable HTTP, JWT auth, all 9 tools"
```

---

### Task 5.2: OAuth 2.1 metadata + DCR shim

**Files:**
- Create: `backend/functions/mcp-server/oauth-metadata.ts`
- Modify: `backend/functions/mcp-server/handler.ts` (route `/.well-known/oauth-authorization-server` and `/register`)

- [ ] **Step 1: Add metadata routing to `handler.ts`**

In the streamified handler, before the MCP transport dispatch, branch on path:

```ts
const path = event.requestContext?.http?.path ?? "/";

if (path === "/.well-known/oauth-authorization-server") {
  responseStream.setHeader("Content-Type", "application/json");
  responseStream.write(JSON.stringify({
    issuer: `https://cognito-idp.${process.env.COGNITO_REGION}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}`,
    authorization_endpoint: `https://${process.env.COGNITO_DOMAIN}.auth.${process.env.COGNITO_REGION}.amazoncognito.com/oauth2/authorize`,
    token_endpoint: `https://${process.env.COGNITO_DOMAIN}.auth.${process.env.COGNITO_REGION}.amazoncognito.com/oauth2/token`,
    registration_endpoint: `${event.requestContext.http.scheme}://${event.headers.host}/register`,
    response_types_supported: ["code"],
    code_challenge_methods_supported: ["S256"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["openid", "email", "profile"]
  }));
  responseStream.end();
  return;
}

if (path === "/register" && event.requestContext.http.method === "POST") {
  // DCR shim: accept any registration request, return our static client.
  responseStream.setHeader("Content-Type", "application/json");
  responseStream.statusCode = 201;
  responseStream.write(JSON.stringify({
    client_id: process.env.MCP_OAUTH_CLIENT_ID,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    redirect_uris: JSON.parse(event.body ?? "{}").redirect_uris ?? [],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none"
  }));
  responseStream.end();
  return;
}

// Otherwise dispatch to MCP transport (existing code below)
```

- [ ] **Step 2: Set up the static Cognito OAuth client**

In `amplify/backend.ts`, configure the User Pool's app client to allow PKCE-only public clients with our redirect URIs. Pseudocode:

```ts
const appClient = backend.auth.resources.userPool.addClient("mcpClient", {
  generateSecret: false,
  oAuth: {
    flows: { authorizationCodeGrant: true } as any,
    callbackUrls: [
      "https://claude.ai/api/mcp/auth_callback",
      "claude://oauth-callback"
    ],
    scopes: ["openid", "email", "profile"]
  }
});
mcpServer.addEnvironment("MCP_OAUTH_CLIENT_ID", appClient.userPoolClientId);
```

- [ ] **Step 3: Commit**

```bash
git add backend/functions/mcp-server/ amplify/backend.ts
git commit -m "feat(backend/mcp-server): OAuth 2.1 metadata + DCR shim for MCP clients"
```

---

### Task 5.3: Test MCP server with `@modelcontextprotocol/inspector`

- [ ] **Step 1: Sandbox deploy**

```bash
npx ampx sandbox
```

Note the `mcpServerUrl` printed in `amplify_outputs.json`.

- [ ] **Step 2: Run inspector**

```bash
npx @modelcontextprotocol/inspector
```

Expected: opens a browser UI. Enter the MCP URL, click connect. OAuth flow opens Cognito Hosted UI; sign in. Inspector shows the 9 tools listed. Click `list_problems`, run with `{}`. Expect a (likely empty) result.

- [ ] **Step 3: Test add_problem from inspector**

Run `add_problem({ solutionText: "def twoSum...:" })`. Verify a problem appears in DynamoDB.

- [ ] **Step 4: Commit no changes (verification step). Note the demoable sandbox URL.**

---

## Phase 6: PWA Chat Drawer

> Goal: Add a chat drawer to the PWA that streams the orchestrator's events. After this phase, the user can chat in-app with the multi-agent system.

### Task 6.1: Orchestrator HTTP-SSE Lambda

**Files:**
- Create: `backend/functions/chat-stream/resource.ts`
- Create: `backend/functions/chat-stream/handler.ts`

- [ ] **Step 1: Define the function in `resource.ts`** (similar to mcpServer, with `RESPONSE_STREAM` invoke mode)

- [ ] **Step 2: Implement `handler.ts`** — verify JWT (Cognito), load ChatSession history (or create new), call `runOrchestrator`, write SSE events to `responseStream`. Persist updated session at the end.

```ts
// Sketch:
export const handler = awslambda.streamifyResponse(async (event: any, responseStream: any) => {
  const userId = await verifyCognitoJwt(event);
  const { sessionId, message } = JSON.parse(event.body);
  const session = sessionId ? await loadSession(userId, sessionId) : await createSession(userId);

  responseStream.setHeader("Content-Type", "text/event-stream");
  responseStream.setHeader("Cache-Control", "no-cache");

  const ctx = buildContext(userId);
  const newMessages: AgentMessage[] = [...session.messages, { role: "user", content: message }];

  const writeEvent = (name: string, data: any) => {
    responseStream.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  let finalAssistantMessage = "";
  for await (const ev of runOrchestrator(ctx, session.messages, message)) {
    writeEvent(ev.type, ev);
    if (ev.type === "done") finalAssistantMessage = ev.finalMessage;
  }

  // Persist
  await saveSession(userId, session.id, [...newMessages, { role: "assistant", content: finalAssistantMessage }]);
  writeEvent("session_saved", { sessionId: session.id });
  responseStream.end();
});
```

- [ ] **Step 3: Wire in `amplify/backend.ts`** with grants on Problem, RateLimit, ChatSession tables and the AI logs bucket. Configure Function URL with `RESPONSE_STREAM`.

- [ ] **Step 4: Commit**

```bash
git add backend/functions/chat-stream/ amplify/backend.ts
git commit -m "feat(backend/functions): chat-stream orchestrator Lambda with SSE response streaming"
```

---

### Task 6.2: Frontend chat drawer components

**Files:**
- Create: `frontend/src/lib/chat.js` (SSE-over-fetch client)
- Create: `frontend/src/components/ChatDrawer.jsx`
- Create: `frontend/src/components/ChatMessage.jsx`
- Create: `frontend/src/components/ToolCallCard.jsx`
- Modify: `frontend/src/App.jsx` to mount `<ChatDrawer />`
- Modify: `frontend/src/components/Topbar.jsx` to add a chat icon

- [ ] **Step 1: `frontend/src/lib/chat.js`**

```js
import { fetchAuthSession } from "aws-amplify/auth";

export async function* streamChat({ message, sessionId, mcpUrlOverride }) {
  const { tokens } = await fetchAuthSession();
  const idToken = tokens?.idToken?.toString();
  const url = (mcpUrlOverride || import.meta.env.VITE_CHAT_STREAM_URL);

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ message, sessionId })
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const eventMatch = chunk.match(/event: (.+)\n/);
      const dataMatch = chunk.match(/data: (.+)$/s);
      if (eventMatch && dataMatch) {
        yield { type: eventMatch[1], data: JSON.parse(dataMatch[1]) };
      }
    }
  }
}
```

- [ ] **Step 2: `frontend/src/components/ChatDrawer.jsx`** — slide-in drawer, message list, send button, calls `streamChat`, accumulates events into UI state.

- [ ] **Step 3: `frontend/src/components/ChatMessage.jsx`** — renders user vs agent messages, with markdown-light formatting for agent text.

- [ ] **Step 4: `frontend/src/components/ToolCallCard.jsx`** — collapsible card showing `🔧 list_problems(...)`, expands to show args + result.

- [ ] **Step 5: Mount in `App.jsx`** — drawer is hidden by default, opened by topbar chat icon. Replace the `Composer`'s old `onSubmit` to send a message to the chat drawer's Curator path instead of the v1 fake-AI path.

- [ ] **Step 6: Add `VITE_CHAT_STREAM_URL` to Vite env** — populate from `amplify_outputs.json.custom.chatStreamUrl` at build time.

- [ ] **Step 7: Manual end-to-end test**

```bash
# Terminal 1: sandbox
npx ampx sandbox

# Terminal 2: frontend
cd frontend && npm run dev
```

Sign in. Open chat drawer. Type "I just did Two Sum, here's my code:\n\ndef twoSum(...): ...". Watch:
- Route event arrives ("curator").
- Tool call card animates in: `add_problem({ solutionText: "..." })`.
- Tool result card.
- Agent thinking event with the curator's confirmation message.
- New tile appears in the home grid (because we refetch problems on chat-drawer-action).

Try "How am I doing this week?" → routes to analyst. Try "Make me a 5-day plan" → routes to planner.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/chat.js frontend/src/components/ChatDrawer.jsx frontend/src/components/ChatMessage.jsx frontend/src/components/ToolCallCard.jsx frontend/src/App.jsx frontend/src/components/Topbar.jsx
git commit -m "feat(frontend): chat drawer with SSE streaming, tool-call cards, agent message UI"
```

---

## Phase 7: Deployment & Monitoring

(Same as v1 plan Phase 4, with two additions: monitor the new mcpServer and chat-stream Lambdas, and add the MCP server URL to the Cognito callback list.)

### Task 7.1: `amplify.yml` build spec

Same as v1 plan Task 4.1.

### Task 7.2: Connect repo + first prod deploy

Same as v1 plan Task 4.2.

### Task 7.3: CloudWatch alarms

Adapted from v1 plan Task 4.3. Add alarms for:
- `mcpServer` Lambda errors > 5/5min
- `chatStream` Lambda errors > 5/5min
- `mcpServer` invocations > 500/hour (anomaly)
- `extractProblem` (now `add_problem` invocations from inside add_problem code) — optional, since it's wrapped inside the agent path, can be measured at agent loop level

### Task 7.4: AWS Budgets + OpenAI budget cap

Same as v1 plan Tasks 4.4 + 4.5.

### Task 7.5: Final smoke test

Same as v1 plan Task 4.6, plus:

- [ ] **Connect MCP server from Claude Desktop**

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) to add:

```json
{
  "mcpServers": {
    "lc-tracker": {
      "url": "https://<your-mcp-url>/"
    }
  }
}
```

Restart Claude Desktop. Sign in via the OAuth pop-up. Type "use lc-tracker to list my problems". Verify the tools work end-to-end from an external MCP client.

---

## Phase 8: README + Demo Materials

> Goal: portfolio-ready repo. Architecture diagram, demo script, ~5-minute video walkthrough.

### Task 8.1: Top-level `README.md`

**Files:**
- Create: root `README.md`

- [ ] **Step 1: Write a README that includes:**

1. **One-paragraph pitch** — what the tracker does + the multi-agent + MCP architecture.
2. **Architecture diagram** — embed the §2 diagram from the spec as ASCII or Mermaid.
3. **Tech stack** — bulleted, reads like a resume bullet.
4. **The interesting bits** — three 3-line callouts:
   - "Shared tool layer, two transports" (with code snippet showing the import-once pattern).
   - "Bounded agent loops" (10-call cap, 30s timeout — proactive failure modes).
   - "OAuth 2.1 with Cognito + DCR shim" (because Cognito doesn't support DCR natively).
5. **Demo** — link to the demo video.
6. **Run locally** — sandbox + frontend dev instructions.
7. **Deploy** — amplify hosting steps.

- [ ] **Step 2: Mermaid architecture diagram** — adapt the §2 spec diagram, ensure it renders on GitHub.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: portfolio-ready README with architecture, demo, and run-locally instructions"
```

---

### Task 8.2: Demo video / GIFs

- [ ] **Step 1: Record a ~5-minute screen capture** following the demo playbook in spec §12.
- [ ] **Step 2: Embed in README** (as a YouTube/Loom link).

---

## Self-Review Notes

**Spec coverage check (v2 spec ↔ this plan):**

| Spec section | Plan tasks |
|---|---|
| §2 Architecture / Repo layout | Phase 2.1 (folder + shim), all phases reference `backend/` |
| §3 Tool Catalog | Phase 3 (9 tools, each TDD'd) |
| §4 Agents | Phase 4 (Curator/Analyst/Planner + Orchestrator) |
| §5 MCP Server | Phase 5 (Lambda + Streamable HTTP + OAuth metadata + DCR shim) |
| §6 Data Model (ChatSession added) | Phase 2.3 |
| §7 Frontend Chat Drawer | Phase 6 (orchestrator Lambda + drawer UI) |
| §8 Deployment | Phase 7 |
| §9 Guardrails | Phase 7 (alarms) + tools layer (rate limits embedded) + agent loop (max-call cap) |
| §10 Error Handling | Per-tool rejects + frontend toast mapping (in chat drawer) |
| §11 Testing | Per-tool tests in Phase 3, agent tests in Phase 4, MCP smoke test in 5.3 |
| §12 Demo Playbook | Phase 8.2 |
| §13 Open Questions for v3 | Out of scope, not in plan |

**Placeholder scan:** verified — no `TBD`/`TODO`. Open uncertainties (`<APP_ID>` Cognito callback URL, the precise Amplify Gen 2 cross-resource grant API shape, the exact `streamifyResponse` + MCP SDK adapter signatures) are explicitly flagged with the *intent* spelled out.

**Type consistency:** `Problem` is the same shape across `_types.ts` (zod), `data/resource.ts` (Amplify Data schema), and Lambda handlers. `ChatSession.messages` is `AWSJSON` end-to-end. Tool input/output types are zod-defined and consumed by both OpenAI's `tools:[{type:"function",...}]` array and MCP's tool registry through `zodToJsonSchema`.

**Scope:** the plan is large (8 phases), but the phases are sequenced correctly:
- Phase 1 (frontend Vite) is independent.
- Phase 2 (Amplify base) unblocks Phases 3+.
- Phase 3 (tools) unblocks Phases 4 and 5.
- Phases 4 and 5 are independent of each other.
- Phase 6 needs Phase 4. Phase 7 needs all prior.
- Phase 8 is documentation/demo, can run in parallel with Phase 7's manual ops.

The plan can ship phase-by-phase to staging; each phase produces a working incremental.

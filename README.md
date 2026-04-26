<div align="center">
  <img src="frontend/public/icon.svg" width="96" alt="logo" />

  <h1>Oliver's Leetcode Tracker</h1>

  <p>
    <strong>Paste a solution. Get a tracked, tagged tile.</strong><br/>
    LLM-extracted Leetcode tracker with a three-agent chat assistant —
    also exposed as a public MCP server so Claude Desktop can drive it.
  </p>

  <p>
    <img alt="React" src="https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB"/>
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white"/>
    <img alt="AWS Amplify" src="https://img.shields.io/badge/Amplify%20Gen%202-FF9900?style=flat&logo=awsamplify&logoColor=white"/>
    <img alt="OpenAI" src="https://img.shields.io/badge/OpenAI-412991?style=flat&logo=openai&logoColor=white"/>
    <img alt="MCP" src="https://img.shields.io/badge/MCP-000000?style=flat&logo=anthropic&logoColor=white"/>
  </p>
</div>

---

## What it does

- **Paste-to-track.** Drop solution code into the composer; one OpenAI call extracts number, title, difficulty, tags, and description. A tile lands on the heatmap.
- **Three agents, one chat.** Curator adds/edits problems, Analyst reads your stats, Planner suggests what's next. An intent classifier routes each message in one cheap call.
- **Same nine tools, two transports.** The PWA's chat drawer calls them in-process; Claude Desktop calls them over OAuth-protected MCP. No fork.
- **Installable PWA** with auto-fitting heatmap, dark mode, and a resizable docked chat panel.

## How it's built

```
PWA  ──►  AppSync (CRUD)
  │       chat-stream Lambda  ──►  Curator | Analyst | Planner
  │                                   └─ tools/*.ts (9 tools)  ──►  DynamoDB / OpenAI
  │
  └──  external MCP clients  ──►  mcp-server Lambda (OAuth 2.1, same 9 tools)
```

React + Vite PWA on top of Amplify Gen 2 (Cognito, AppSync, DynamoDB, S3, Lambda). Agents run on OpenAI function-calling with a `runAgent` loop bounded by a 10-call cap and 30s timeout. The MCP server speaks Streamable HTTP via `@modelcontextprotocol/sdk` with a Cognito DCR shim. 57 vitest unit tests over the tool layer.

## Run locally

```bash
git clone <repo-url> && cd leetcode
(cd frontend && npm install) && (cd backend && npm install) && (cd amplify && npm install)

echo "sk-proj-..." > openai_key
cat openai_key | tr -d '\n' | npx ampx sandbox secret set OPENAI_API_KEY

npx ampx sandbox          # terminal 1
cd frontend && npm run dev # terminal 2
```

Open <http://localhost:8765/>, sign up with email, paste a solution.

For production deploy on Amplify Hosting, see [`docs/MANUAL_OPS.md`](docs/MANUAL_OPS.md).

import { defineFunction, secret } from "@aws-amplify/backend";

// Phase 6: Chat-stream Lambda — orchestrator entry point for the PWA chat drawer.
// Exposed via Function URL with RESPONSE_STREAM invoke mode. Streams SSE events as the
// orchestrator + sub-agents work. JWT auth is verified in-handler (jose, RemoteJWKSet),
// so the URL is configured with authType=NONE.
export const chatStream = defineFunction({
  name: "chatStream",
  entry: "../../../backend/functions/chat-stream/handler.ts",
  timeoutSeconds: 60,
  memoryMB: 1024,
  runtime: 20,
  resourceGroupName: "data",
  environment: {
    OPENAI_API_KEY: secret("OPENAI_API_KEY"),
    AI_DAILY_RATE_LIMIT: "50",
    MCP_TOOL_DAILY_LIMIT: "200",
    OPENAI_MODEL_EXTRACTION: "gpt-5",
    OPENAI_MODEL_REASONING: "gpt-5",
    OPENAI_MODEL_INTENT: "gpt-5-mini"
  }
});

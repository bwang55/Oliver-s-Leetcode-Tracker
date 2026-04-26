import { defineFunction, secret } from "@aws-amplify/backend";

// Phase 5: MCP server Lambda exposed via Function URL with RESPONSE_STREAM invoke mode.
// Auth is handled in-handler (Cognito JWT verified via jose). Co-located with the data
// stack so we can grant access to DDB tables / S3 buckets without circular auth/data deps.
export const mcpServer = defineFunction({
  name: "mcpServer",
  entry: "../../../backend/functions/mcp-server/handler.ts",
  timeoutSeconds: 60,
  memoryMB: 1024,
  runtime: 20,
  resourceGroupName: "data",
  environment: {
    OPENAI_API_KEY: secret("OPENAI_API_KEY"),
    AI_DAILY_RATE_LIMIT: "50",
    MCP_TOOL_DAILY_LIMIT: "200",
    // Mirror chat-stream defaults: gpt-5.4-mini for speed.
    OPENAI_MODEL_EXTRACTION: "gpt-5.4-mini",
    OPENAI_MODEL_REASONING: "gpt-5.4-mini",
    OPENAI_MODEL_INTENT: "gpt-5.4-mini"
  }
});

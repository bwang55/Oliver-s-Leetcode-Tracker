// Amplify Gen 2 entry point. The CLI's path verifier requires that defineAuth/Data/Storage
// be called from amplify/<thing>/resource.ts; the actual handler logic still lives under
// ../backend/ so the resource files here are thin re-exports of the call site.
import { defineBackend } from "@aws-amplify/backend";
import { Duration, Stack } from "aws-cdk-lib";
import { Bucket, StorageClass } from "aws-cdk-lib/aws-s3";
import { FunctionUrlAuthType, InvokeMode, HttpMethod } from "aws-cdk-lib/aws-lambda";
import { OAuthScope } from "aws-cdk-lib/aws-cognito";
import { auth } from "./auth/resource.js";
import { data } from "./data/resource.js";
import { exportsBucket, aiLogsBucket } from "./storage/resource.js";
import { exportData } from "./functions/export-data/resource.js";
import { postConfirmation } from "./auth/post-confirmation/resource.js";
import { mcpServer } from "./functions/mcp-server/resource.js";
import { chatStream } from "./functions/chat-stream/resource.js";

export const backend = defineBackend({
  auth,
  data,
  exportsBucket,
  aiLogsBucket,
  exportData,
  postConfirmation,
  mcpServer,
  chatStream
});

// Cross-resource wiring: postConfirmation Lambda needs to write to the User table.
// PROBLEM: data stack already depends on auth (data API uses Cognito user pool for
// authorization). If we additionally add a grant or env var that makes auth depend
// on data (e.g. userTable.grantWriteData(lambda) or addEnvironment with userTable.tableName),
// CloudFormation rejects the deploy with a circular nested-stack dependency.
// TODO(phase3): break the cycle by either (a) provisioning the User row from a different
// trigger that lives in the data stack, or (b) using an SSM parameter / Lambda-side
// table name lookup so the env var doesn't reference a CFN export from the data stack.
// For now the postConfirmation handler will throw at runtime until this is wired.

// Lifecycle rules. Amplify exposes `resources.bucket` typed as `IBucket`, but the
// underlying construct is the concrete L2 `Bucket`, which has `addLifecycleRule`.
// ai-logs: bulk write-heavy with rare reads — transition to IA at 30d, expire at 90d.
(backend.aiLogsBucket.resources.bucket as Bucket).addLifecycleRule({
  id: "expire-ai-logs",
  enabled: true,
  expiration: Duration.days(90),
  transitions: [
    { storageClass: StorageClass.INFREQUENT_ACCESS, transitionAfter: Duration.days(30) }
  ]
});
// exports: transient user-facing downloads — expire at 30d.
(backend.exportsBucket.resources.bucket as Bucket).addLifecycleRule({
  id: "expire-exports",
  enabled: true,
  expiration: Duration.days(30)
});

// Grants for exportData Lambda: read Problem table + read/write exports bucket.
backend.data.resources.tables["Problem"].grantReadData(backend.exportData.resources.lambda);
backend.exportsBucket.resources.bucket.grantReadWrite(backend.exportData.resources.lambda);
backend.exportData.addEnvironment(
  "AMPLIFY_DATA_PROBLEM_TABLE_NAME",
  backend.data.resources.tables["Problem"].tableName
);
backend.exportData.addEnvironment(
  "EXPORTS_BUCKET_NAME",
  backend.exportsBucket.resources.bucket.bucketName
);

// ---------------------------------------------------------------------------
// Phase 5: MCP server Lambda
// ---------------------------------------------------------------------------

// IAM grants — DDB tables and S3 bucket for ai-logs.
const mcpLambda = backend.mcpServer.resources.lambda;
backend.data.resources.tables["Problem"].grantReadWriteData(mcpLambda);
backend.data.resources.tables["RateLimit"].grantReadWriteData(mcpLambda);
backend.data.resources.tables["User"].grantReadData(mcpLambda);
backend.aiLogsBucket.resources.bucket.grantWrite(mcpLambda);

// Env vars — table names, bucket names, Cognito coordinates for JWT verification.
backend.mcpServer.addEnvironment("PROBLEM_TABLE", backend.data.resources.tables["Problem"].tableName);
backend.mcpServer.addEnvironment("USER_TABLE", backend.data.resources.tables["User"].tableName);
backend.mcpServer.addEnvironment("RATELIMIT_TABLE", backend.data.resources.tables["RateLimit"].tableName);
backend.mcpServer.addEnvironment("AI_LOGS_BUCKET", backend.aiLogsBucket.resources.bucket.bucketName);
backend.mcpServer.addEnvironment("EXPORTS_BUCKET", backend.exportsBucket.resources.bucket.bucketName);
backend.mcpServer.addEnvironment("COGNITO_USER_POOL_ID", backend.auth.resources.userPool.userPoolId);
backend.mcpServer.addEnvironment(
  "COGNITO_REGION",
  Stack.of(backend.auth.resources.userPool).region
);

// Lambda Function URL with response streaming. We do JWT auth in-handler, so the URL
// is left as authType=NONE.
const mcpFnUrl = mcpLambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
  invokeMode: InvokeMode.RESPONSE_STREAM,
  cors: {
    // Function URL CORS rejects OPTIONS as an allowed method — Lambda handles
    // preflight automatically by returning the configured allowed origins/headers.
    allowedOrigins: ["*"],
    allowedMethods: [HttpMethod.POST, HttpMethod.GET],
    allowedHeaders: ["authorization", "content-type", "mcp-session-id"]
  }
});

backend.addOutput({ custom: { mcpServerUrl: mcpFnUrl.url } });

// Static Cognito app client used by Claude Desktop / Cursor / etc. when they hit the
// MCP server's OAuth flow. PKCE-only public client, no secret.
const mcpAppClient = backend.auth.resources.userPool.addClient("mcpClient", {
  generateSecret: false,
  authFlows: { userSrp: true },
  oAuth: {
    flows: { authorizationCodeGrant: true },
    callbackUrls: [
      "https://claude.ai/api/mcp/auth_callback",
      "claude://oauth-callback",
      "http://localhost:3334/oauth/callback"
    ],
    scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE]
  }
});
backend.mcpServer.addEnvironment("MCP_OAUTH_CLIENT_ID", mcpAppClient.userPoolClientId);

// Cognito hosted-UI domain — required for the authorization-code grant flow.
const cognitoAccount = Stack.of(backend.auth.resources.userPool).account;
const cognitoDomainPrefix = `lc-tracker-${cognitoAccount}`;
backend.auth.resources.userPool.addDomain("CognitoDomain", {
  cognitoDomain: { domainPrefix: cognitoDomainPrefix }
});
backend.mcpServer.addEnvironment("COGNITO_DOMAIN", cognitoDomainPrefix);

// ---------------------------------------------------------------------------
// Phase 6: chat-stream Lambda (orchestrator entry point for the PWA chat drawer)
// ---------------------------------------------------------------------------

const chatLambda = backend.chatStream.resources.lambda;
backend.data.resources.tables["Problem"].grantReadWriteData(chatLambda);
backend.data.resources.tables["RateLimit"].grantReadWriteData(chatLambda);
backend.data.resources.tables["User"].grantReadData(chatLambda);
backend.data.resources.tables["ChatSession"].grantReadWriteData(chatLambda);
backend.aiLogsBucket.resources.bucket.grantWrite(chatLambda);

backend.chatStream.addEnvironment("PROBLEM_TABLE", backend.data.resources.tables["Problem"].tableName);
backend.chatStream.addEnvironment("USER_TABLE", backend.data.resources.tables["User"].tableName);
backend.chatStream.addEnvironment("RATELIMIT_TABLE", backend.data.resources.tables["RateLimit"].tableName);
backend.chatStream.addEnvironment("CHATSESSION_TABLE", backend.data.resources.tables["ChatSession"].tableName);
backend.chatStream.addEnvironment("AI_LOGS_BUCKET", backend.aiLogsBucket.resources.bucket.bucketName);
backend.chatStream.addEnvironment("EXPORTS_BUCKET", backend.exportsBucket.resources.bucket.bucketName);
backend.chatStream.addEnvironment("COGNITO_USER_POOL_ID", backend.auth.resources.userPool.userPoolId);
backend.chatStream.addEnvironment(
  "COGNITO_REGION",
  Stack.of(backend.auth.resources.userPool).region
);

// Function URL with response streaming. JWT auth is verified in-handler.
const chatFnUrl = chatLambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
  invokeMode: InvokeMode.RESPONSE_STREAM,
  cors: {
    allowedOrigins: ["*"],
    allowedMethods: [HttpMethod.POST, HttpMethod.GET],
    allowedHeaders: ["authorization", "content-type"]
  }
});

backend.addOutput({ custom: { chatStreamUrl: chatFnUrl.url } });

import type { PostConfirmationTriggerHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// Cognito's PostConfirmation trigger. We'd love to write the User row here,
// but `USER_TABLE_NAME` is intentionally not wired (passing the table name
// would create a circular nested-stack dep between auth and data — see
// TODO(phase3) in amplify/backend.ts). The frontend's `ensureUser` mutation
// covers User-row creation on first PWA load instead.
//
// IMPORTANT: this handler MUST NOT throw. Cognito surfaces trigger errors
// back to the user's confirmSignUp call, blocking sign-up entirely. Always
// return the event so confirmation succeeds; failed table writes degrade
// gracefully via the frontend fallback.
export const handler: PostConfirmationTriggerHandler = async (event) => {
  const tableName = process.env.USER_TABLE_NAME;
  if (!tableName) {
    console.log("PostConfirmation: USER_TABLE_NAME unset, deferring to frontend ensureUser fallback");
    return event;
  }

  const userId = event.userName;
  const email = event.request.userAttributes.email;

  try {
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
    }));
  } catch (err: any) {
    if (err.name === "ConditionalCheckFailedException") {
      // Idempotent — row already exists, nothing to do.
    } else {
      // Log but don't throw. Sign-up should not fail because of a
      // bookkeeping write; ensureUser on the frontend will retry.
      console.error("PostConfirmation: User-row write failed, deferring to frontend", err);
    }
  }

  return event;
};

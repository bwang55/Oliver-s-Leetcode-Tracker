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

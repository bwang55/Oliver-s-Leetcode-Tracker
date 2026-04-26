import type { AppSyncResolverHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const PROBLEM_TABLE = process.env.AMPLIFY_DATA_PROBLEM_TABLE_NAME!;
const EXPORTS_BUCKET = process.env.EXPORTS_BUCKET_NAME!;

type Result = { url: string; expiresAt: string };

export const handler: AppSyncResolverHandler<{}, Result> = async (event) => {
  const userId = (event.identity as any)?.sub;
  if (!userId) throw new Error("Unauthorized");

  // Page-scan all the user's problems via the byUserAndDate GSI
  const items: any[] = [];
  let lastKey: any = undefined;
  do {
    const out = await ddb.send(new QueryCommand({
      TableName: PROBLEM_TABLE,
      IndexName: "byUserAndDate",
      KeyConditionExpression: "userId = :u",
      ExpressionAttributeValues: { ":u": userId },
      ExclusiveStartKey: lastKey
    }));
    items.push(...(out.Items || []));
    lastKey = out.LastEvaluatedKey;
  } while (lastKey);

  const ts = new Date().toISOString();
  const key = `${userId}/exports/${ts}.json`;
  await s3.send(new PutObjectCommand({
    Bucket: EXPORTS_BUCKET,
    Key: key,
    Body: JSON.stringify({ exportedAt: ts, userId, problems: items }, null, 2),
    ContentType: "application/json"
  }));

  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: EXPORTS_BUCKET, Key: key }), { expiresIn: 300 });
  return { url, expiresAt: new Date(Date.now() + 300_000).toISOString() };
};

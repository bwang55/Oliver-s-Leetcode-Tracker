// Amplify Gen 2 entry point. The CLI's path verifier requires that defineAuth/Data/Storage
// be called from amplify/<thing>/resource.ts; the actual handler logic still lives under
// ../backend/ so the resource files here are thin re-exports of the call site.
import { defineBackend } from "@aws-amplify/backend";
import { Duration } from "aws-cdk-lib";
import { Bucket, StorageClass } from "aws-cdk-lib/aws-s3";
import { auth } from "./auth/resource.js";
import { data } from "./data/resource.js";
import { exportsBucket, aiLogsBucket } from "./storage/resource.js";
import { exportData } from "./functions/export-data/resource.js";
import { postConfirmation } from "./auth/post-confirmation/resource.js";

export const backend = defineBackend({
  auth,
  data,
  exportsBucket,
  aiLogsBucket,
  exportData,
  postConfirmation
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

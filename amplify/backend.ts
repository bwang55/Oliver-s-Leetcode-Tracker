// This file is a 1-line shim required by Amplify Gen 2's CLI. The real backend
// code lives under ../backend/. Imports are added incrementally as Phase 2-7 add resources.
import { defineBackend } from "@aws-amplify/backend";
import { Duration } from "aws-cdk-lib";
import { Bucket, StorageClass } from "aws-cdk-lib/aws-s3";
import { auth } from "../backend/auth/resource.js";
import { data } from "../backend/data/resource.js";
import { exportsBucket, aiLogsBucket } from "../backend/storage/resource.js";

export const backend = defineBackend({
  auth,
  data,
  exportsBucket,
  aiLogsBucket
});

// Cross-resource wiring: postConfirmation Lambda needs to write to the User table.
// Amplify Gen 2's API for this has shifted across releases; the canonical pattern
// (as of @aws-amplify/backend ^1.5) is via the function's `resources.lambda` and
// `addEnvironment` on the function itself.
const userTable = backend.data.resources.tables["User"];
const postConfirmFn = backend.auth.resources.userPool.node.findChild("postConfirmation") as any;
if (postConfirmFn) {
  userTable.grantWriteData(postConfirmFn);
  postConfirmFn.addEnvironment("USER_TABLE_NAME", userTable.tableName);
}

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

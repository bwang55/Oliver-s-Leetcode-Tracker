// This file is a 1-line shim required by Amplify Gen 2's CLI. The real backend
// code lives under ../backend/. Imports are added incrementally as Phase 2-7 add resources.
import { defineBackend } from "@aws-amplify/backend";
import { auth } from "../backend/auth/resource.js";
import { data } from "../backend/data/resource.js";

export const backend = defineBackend({
  auth,
  data
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

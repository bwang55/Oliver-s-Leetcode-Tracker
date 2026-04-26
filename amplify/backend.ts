// This file is a 1-line shim required by Amplify Gen 2's CLI. The real backend
// code lives under ../backend/. Imports are added incrementally as Phase 2-7 add resources.
import { defineBackend } from "@aws-amplify/backend";
import { auth } from "../backend/auth/resource.js";

export const backend = defineBackend({
  auth
});

// Cross-resource grants (e.g. postConfirmation → User table) are added in Task 2.3
// once the data resource exists. Do not add them here yet.

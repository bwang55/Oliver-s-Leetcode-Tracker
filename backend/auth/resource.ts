import { defineAuth } from "@aws-amplify/backend";
import { postConfirmation } from "./post-confirmation/resource.js";

// v2 launch: email/password only — Cognito stores password hashes, the developer never sees passwords.
// Google OAuth federation is wired in Phase 7 (separate commit) once the Google Cloud client is set up.
export const auth = defineAuth({
  loginWith: {
    email: true
  },
  userAttributes: {
    email: { required: true, mutable: false }
  },
  triggers: { postConfirmation }
});

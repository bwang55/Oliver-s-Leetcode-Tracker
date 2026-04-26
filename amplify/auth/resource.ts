import { defineAuth } from "@aws-amplify/backend";
import { postConfirmation } from "./post-confirmation/resource.js";

// Email/password only. Google OAuth federation is wired through Cognito's
// Hosted UI when ready — see docs/MANUAL_OPS.md for the Google Cloud Console
// + `npx ampx sandbox secret set GOOGLE_CLIENT_ID/SECRET` checklist. Until the
// secrets exist the externalProviders block must stay out, otherwise sandbox
// deploy fails on unresolved secret references.
export const auth = defineAuth({
  loginWith: {
    email: true
  },
  userAttributes: {
    email: { required: true, mutable: false }
  },
  triggers: { postConfirmation }
});

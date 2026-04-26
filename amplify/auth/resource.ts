import { defineAuth, secret } from "@aws-amplify/backend";
import { postConfirmation } from "./post-confirmation/resource.js";

// Email/password is preserved alongside Google federation so existing accounts
// keep working. Google goes through the Cognito Hosted UI:
//
//   user → "Continue with Google" → Hosted UI → google.com/oauth → Hosted UI
//        → callback URL → Amplify finishes the code-for-token exchange
//
// The Hosted UI lives at https://<domainPrefix>.auth.<region>.amazoncognito.com;
// Amplify Gen 2 auto-derives `domainPrefix` from the backend's stable hash, so
// it is not configured here.
//
// PostConfirmation only fires for native (email/password) users. Federated
// users get their User row from `ensureUser` on first PWA load instead.
export const auth = defineAuth({
  loginWith: {
    email: true,
    externalProviders: {
      google: {
        clientId: secret("GOOGLE_CLIENT_ID"),
        clientSecret: secret("GOOGLE_CLIENT_SECRET"),
        scopes: ["email", "profile", "openid"],
        attributeMapping: {
          email: "email",
          fullname: "name"
        }
      },
      callbackUrls: [
        "http://localhost:5173/",
        "http://localhost:4173/"
      ],
      logoutUrls: [
        "http://localhost:5173/",
        "http://localhost:4173/"
      ]
    }
  },
  userAttributes: {
    email: { required: true, mutable: false }
  },
  triggers: { postConfirmation }
});

import { defineFunction } from "@aws-amplify/backend";

export const postConfirmation = defineFunction({
  name: "postConfirmation",
  entry: "../../../backend/auth/post-confirmation/handler.ts",
  resourceGroupName: "auth"
});

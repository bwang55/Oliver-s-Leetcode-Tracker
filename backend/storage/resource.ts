import { defineStorage } from "@aws-amplify/backend";

export const exportsBucket = defineStorage({
  name: "exports",
  access: (allow) => ({
    "{userId}/exports/*": [allow.entity("identity").to(["read"])]
  })
});

export const aiLogsBucket = defineStorage({
  name: "aiLogs",
  isDefault: false,
  access: () => ({}) // Lambda-only via IAM grants added when functions are created in Phase 3+
});

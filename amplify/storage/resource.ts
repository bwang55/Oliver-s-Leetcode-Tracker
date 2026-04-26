import { defineStorage } from "@aws-amplify/backend";

export const exportsBucket = defineStorage({
  name: "exports",
  isDefault: true,
  // Lambda-only via IAM grants in backend.ts. Direct S3 reads aren't needed because
  // the exportData Lambda returns a presigned URL.
  access: () => ({})
});

export const aiLogsBucket = defineStorage({
  name: "aiLogs",
  isDefault: false,
  access: () => ({}) // Lambda-only via IAM grants added when functions are created in Phase 3+
});

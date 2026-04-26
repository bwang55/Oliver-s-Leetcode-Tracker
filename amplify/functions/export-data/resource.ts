import { defineFunction } from "@aws-amplify/backend";

export const exportData = defineFunction({
  name: "exportData",
  entry: "../../../backend/functions/export-data/handler.ts",
  timeoutSeconds: 30,
  memoryMB: 256,
  runtime: 20,
  resourceGroupName: "data"
});

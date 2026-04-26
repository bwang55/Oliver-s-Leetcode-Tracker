// This file is a 1-line shim required by Amplify Gen 2's CLI. The real backend
// code lives under ../backend/. Tasks 2.2–2.7 will append imports + resources
// as they're added; Phase 4–7 will add: agent Lambdas, mcpServer, chatStream.
import { defineBackend } from "@aws-amplify/backend";

export const backend = defineBackend({});

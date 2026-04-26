import { type ClientSchema, a, defineData } from "@aws-amplify/backend";
import { exportData } from "../functions/export-data/resource.js";

const schema = a.schema({
  Difficulty: a.enum(["EASY", "MEDIUM", "HARD"]),

  User: a
    .model({
      userId: a.id().required(),
      email: a.email().required(),
      displayName: a.string(),
      dailyTarget: a.integer().required().default(3),
      createdAt: a.datetime().required()
    })
    .identifier(["userId"])
    .authorization((allow) => [allow.ownerDefinedIn("userId")]),

  Problem: a
    .model({
      id: a.id().required(),
      userId: a.id().required(),
      number: a.integer().required(),
      title: a.string().required(),
      difficulty: a.ref("Difficulty").required(),
      tags: a.string().array().required(),
      solvedAt: a.datetime().required(),
      description: a.string(),
      constraints: a.string().array(),
      solutions: a.json(),
      note: a.string()
    })
    .identifier(["id"])
    .secondaryIndexes((idx) => [idx("userId").sortKeys(["solvedAt"]).name("byUserAndDate")])
    .authorization((allow) => [allow.ownerDefinedIn("userId")]),

  RateLimit: a
    .model({
      userId: a.id().required(),
      dayKey: a.string().required(),
      aiCallCount: a.integer().required().default(0),
      mcpToolCount: a.integer().required().default(0),
      ttl: a.timestamp()
    })
    .identifier(["userId", "dayKey"])
    .authorization((allow) => [allow.authenticated().to([])]), // Lambda-only via IAM

  ChatSession: a
    .model({
      id: a.id().required(),
      userId: a.id().required(),
      agentRoute: a.string().required(),
      messages: a.json().required(),
      createdAt: a.datetime().required(),
      updatedAt: a.datetime().required()
    })
    .identifier(["id"])
    .secondaryIndexes((idx) => [idx("userId").sortKeys(["updatedAt"]).name("byUserAndUpdated")])
    .authorization((allow) => [allow.ownerDefinedIn("userId")]),

  ExportLink: a.customType({
    url: a.url().required(),
    expiresAt: a.datetime().required()
  }),

  exportMyData: a
    .mutation()
    .arguments({})
    .returns(a.ref("ExportLink"))
    .handler(a.handler.function(exportData))
    .authorization((allow) => [allow.authenticated()])
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: { defaultAuthorizationMode: "userPool" }
});

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // OAuth credentials for the connected Gmail account (single user).
  auth: defineTable({
    accountEmail: v.string(),
    refreshToken: v.string(),
    accessToken: v.optional(v.string()),
    accessTokenExpiresAt: v.optional(v.number()),
    scope: v.optional(v.string()),
    // The account the app currently monitors / sends from.
    active: v.optional(v.boolean()),
    updatedAt: v.number(),
  }).index("by_accountEmail", ["accountEmail"]),

  // Emails persisted from Gmail (graduation matches / alerts).
  messages: defineTable({
    gmailId: v.string(),
    threadId: v.string(),
    from: v.string(),
    to: v.optional(v.string()),
    subject: v.string(),
    snippet: v.string(),
    receivedAt: v.number(),
    labelIds: v.array(v.string()),
    unread: v.boolean(),
    matchedQueries: v.array(v.string()),
    notifiedAt: v.optional(v.number()),
    syncedAt: v.number(),
  })
    .index("by_gmailId", ["gmailId"])
    .index("by_receivedAt", ["receivedAt"]),

  // Polling bookkeeping so the UI can show "last checked ...".
  syncState: defineTable({
    key: v.string(),
    lastPolledAt: v.number(),
    lastError: v.optional(v.string()),
    lastMessageAt: v.optional(v.number()),
  }).index("by_key", ["key"]),
});

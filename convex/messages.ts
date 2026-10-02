import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";

// Insert a matched email, or update it if we've seen this Gmail id before.
export const recordMatch = internalMutation({
  args: {
    gmailId: v.string(),
    threadId: v.string(),
    from: v.string(),
    subject: v.string(),
    snippet: v.string(),
    receivedAt: v.number(),
    labelIds: v.array(v.string()),
    unread: v.boolean(),
    matchedQueries: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("messages")
      .withIndex("by_gmailId", (q) => q.eq("gmailId", args.gmailId))
      .unique();

    if (existing) {
      const merged = Array.from(
        new Set([...existing.matchedQueries, ...args.matchedQueries]),
      );
      await ctx.db.patch("messages", existing._id, {
        matchedQueries: merged,
        unread: args.unread,
        labelIds: args.labelIds,
        syncedAt: Date.now(),
      });
      return { id: existing._id, isNew: false as const };
    }

    const id = await ctx.db.insert("messages", {
      gmailId: args.gmailId,
      threadId: args.threadId,
      from: args.from,
      subject: args.subject,
      snippet: args.snippet,
      receivedAt: args.receivedAt,
      labelIds: args.labelIds,
      unread: args.unread,
      matchedQueries: args.matchedQueries,
      syncedAt: Date.now(),
    });
    return { id, isNew: true as const };
  },
});

export const markNotified = internalMutation({
  args: { id: v.id("messages"), at: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.patch("messages", args.id, { notifiedAt: args.at });
  },
});

export const setSyncState = internalMutation({
  args: {
    key: v.string(),
    lastPolledAt: v.number(),
    lastError: v.string(),
    lastMessageAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const doc = {
      key: args.key,
      lastPolledAt: args.lastPolledAt,
      lastError: args.lastError,
      ...(args.lastMessageAt !== undefined
        ? { lastMessageAt: args.lastMessageAt }
        : {}),
    };

    const existing = await ctx.db
      .query("syncState")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();

    if (existing) {
      await ctx.db.patch("syncState", existing._id, doc);
    } else {
      await ctx.db.insert("syncState", doc);
    }
  },
});

// Most recent matched emails (for the dashboard).
export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 100);
    return await ctx.db
      .query("messages")
      .withIndex("by_receivedAt")
      .order("desc")
      .take(limit);
  },
});

export const syncStatus = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("syncState")
      .withIndex("by_key", (q) => q.eq("key", "gmail"))
      .unique();
  },
});

export const getSyncState = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("syncState")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
  },
});

// Reset the match index and sync state (used to re-backfill cleanly).
export const clearAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("messages").take(1000);
    for (const row of rows) {
      await ctx.db.delete("messages", row._id);
    }
    const states = await ctx.db.query("syncState").take(100);
    for (const state of states) {
      await ctx.db.delete("syncState", state._id);
    }
    return rows.length;
  },
});

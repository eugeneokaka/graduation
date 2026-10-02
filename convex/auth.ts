import { v } from "convex/values";
import {
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";

// Single-account app: exactly one auth row is "active" at a time — the most
// recently connected account. Older rows are kept but marked inactive.
async function pickActive(ctx: QueryCtx | MutationCtx) {
  const rows = await ctx.db.query("auth").order("desc").take(100);
  return rows.find((row) => row.active) ?? rows[0] ?? null;
}

// Upsert OAuth credentials. Guarded by a shared secret so the public mutation
// can't be abused.
export const saveAuth = mutation({
  args: {
    secret: v.string(),
    accountEmail: v.string(),
    refreshToken: v.string(),
    accessToken: v.optional(v.string()),
    accessTokenExpiresAt: v.optional(v.number()),
    scope: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.secret !== process.env.AUTH_SECRET) {
      throw new Error("Unauthorized");
    }

    // Connecting an account makes it the active one.
    const all = await ctx.db.query("auth").take(100);
    for (const row of all) {
      if (row.accountEmail !== args.accountEmail && row.active) {
        await ctx.db.patch("auth", row._id, { active: false });
      }
    }

    const doc = {
      accountEmail: args.accountEmail,
      refreshToken: args.refreshToken,
      active: true,
      updatedAt: Date.now(),
      ...(args.accessToken !== undefined
        ? { accessToken: args.accessToken }
        : {}),
      ...(args.accessTokenExpiresAt !== undefined
        ? { accessTokenExpiresAt: args.accessTokenExpiresAt }
        : {}),
      ...(args.scope !== undefined ? { scope: args.scope } : {}),
    };

    const existing = await ctx.db
      .query("auth")
      .withIndex("by_accountEmail", (q) =>
        q.eq("accountEmail", args.accountEmail),
      )
      .unique();

    if (existing) {
      await ctx.db.patch("auth", existing._id, doc);
      return existing._id;
    }
    return await ctx.db.insert("auth", doc);
  },
});

// Lightweight status for the UI ("connected as ...").
export const getAuthStatus = query({
  args: {},
  handler: async (ctx) => {
    const auth = await pickActive(ctx);
    if (!auth) return null;
    return { accountEmail: auth.accountEmail, updatedAt: auth.updatedAt };
  },
});

// Full auth document (includes the refresh token). Internal only — never
// expose tokens to clients.
export const getAuthDoc = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await pickActive(ctx);
  },
});

// Remove every connected account. Used to switch Gmail accounts cleanly.
export const clearAuth = mutation({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    if (args.secret !== process.env.AUTH_SECRET) {
      throw new Error("Unauthorized");
    }
    const all = await ctx.db.query("auth").take(100);
    for (const row of all) {
      await ctx.db.delete("auth", row._id);
    }
    return all.length;
  },
});

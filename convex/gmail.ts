import { v } from "convex/values";
import {
  action,
  internalAction,
  type ActionCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

type GmailHeader = { name?: string; value?: string };

type GmailMessage = {
  id?: string;
  threadId?: string;
  snippet?: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: { headers?: GmailHeader[] };
};

export type InboxMessage = {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  date: number;
  unread: boolean;
  labelIds: string[];
  url: string;
};

function clamp(value: number | undefined, fallback = 20): number {
  return Math.min(Math.max(value ?? fallback, 1), 50);
}

// Base64URL encode bytes (no Node Buffer needed in the default runtime).
const B64URL =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function base64url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += B64URL[b0 >> 2];
    out += B64URL[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 !== undefined) out += B64URL[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 !== undefined) out += B64URL[b2 & 63];
  }
  return out;
}

async function refreshAccessToken(
  refreshToken: string,
  cached: string | undefined,
  expiresAt: number | undefined,
): Promise<string> {
  if (cached && expiresAt && Date.now() < expiresAt - 60_000) {
    return cached;
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

function headerValue(message: GmailMessage, name: string): string {
  const headers = message.payload?.headers ?? [];
  const found = headers.find(
    (h) => h.name?.toLowerCase() === name.toLowerCase(),
  );
  return found?.value ?? "";
}

async function getAccessTokenFor(
  ctx: ActionCtx,
  secret: string,
): Promise<{ accessToken: string; accountEmail: string } | null> {
  if (secret !== process.env.AUTH_SECRET) {
    throw new Error("Unauthorized");
  }
  const auth = await ctx.runQuery(internal.auth.getAuthDoc, {});
  if (!auth) return null;

  const accessToken = await refreshAccessToken(
    auth.refreshToken,
    auth.accessToken,
    auth.accessTokenExpiresAt,
  );
  return { accessToken, accountEmail: auth.accountEmail };
}

async function fetchMessage(
  accessToken: string,
  id: string,
): Promise<InboxMessage> {
  const res = await fetch(
    `${GMAIL_API}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const msg = (await res.json()) as GmailMessage;
  return {
    id: msg.id ?? id,
    threadId: msg.threadId ?? "",
    from: headerValue(msg, "From"),
    subject: headerValue(msg, "Subject") || "(no subject)",
    snippet: msg.snippet ?? "",
    date: Number(msg.internalDate ?? 0),
    unread: (msg.labelIds ?? []).includes("UNREAD"),
    labelIds: msg.labelIds ?? [],
    url: `https://mail.google.com/mail/u/0/#all/${id}`,
  };
}

async function fetchMessages(
  accessToken: string,
  opts: { query?: string; labelIds?: string[]; maxResults: number },
): Promise<InboxMessage[]> {
  const params = new URLSearchParams();
  params.set("maxResults", String(opts.maxResults));
  if (opts.query) params.set("q", opts.query);
  for (const label of opts.labelIds ?? []) {
    params.append("labelIds", label);
  }

  const res = await fetch(`${GMAIL_API}/messages?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Gmail list failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    messages?: { id: string; threadId: string }[];
  };
  const ids = (data.messages ?? []).map((m) => m.id);
  return Promise.all(ids.map((id) => fetchMessage(accessToken, id)));
}

async function sendAlert(
  accessToken: string,
  opts: { to: string; from: string; subject: string; text: string },
): Promise<void> {
  const raw = [
    `To: ${opts.to}`,
    `From: ${opts.from}`,
    `Subject: ${opts.subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    opts.text,
  ].join("\r\n");

  const res = await fetch(`${GMAIL_API}/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: base64url(new TextEncoder().encode(raw)) }),
  });
  if (!res.ok) {
    throw new Error(`Send failed: ${res.status} ${await res.text()}`);
  }
}

type CheckResult = {
  ok: boolean;
  query?: string;
  email?: string;
  checked: number;
  newMatches: number;
  alerted?: number;
  notifyEmail?: string | null;
  firstRun?: boolean;
  error?: string;
};

async function runCheck(ctx: ActionCtx, query: string): Promise<CheckResult> {
  const auth = await ctx.runQuery(internal.auth.getAuthDoc, {});
  if (!auth) {
    await ctx.runMutation(internal.messages.setSyncState, {
      key: "gmail",
      lastPolledAt: Date.now(),
      lastError: "No Gmail account connected",
    });
    return {
      ok: false,
      error: "No Gmail account connected",
      checked: 0,
      newMatches: 0,
    };
  }

  try {
    const accessToken = await refreshAccessToken(
      auth.refreshToken,
      auth.accessToken,
      auth.accessTokenExpiresAt,
    );
    const previous = await ctx.runQuery(internal.messages.getSyncState, {
      key: "gmail",
    });
    // First ever run: index everything but don't spam alerts for the backlog.
    const firstRun = !previous;

    // Only look at recent mail, and never at our own alert emails (their
    // subject/body contain the query, which would cause a notification loop).
    const lookback = process.env.CHECK_LOOKBACK?.trim() || "3d";
    const found = await fetchMessages(accessToken, {
      query: `${query} newer_than:${lookback} -in:sent`,
      maxResults: 50,
    });
    const notifyEmail = process.env.NOTIFY_EMAIL?.trim() || null;

    let newMatches = 0;
    let alerted = 0;

    for (const m of found) {
      if (m.labelIds.includes("SENT")) continue;
      const recorded = await ctx.runMutation(internal.messages.recordMatch, {
        gmailId: m.id,
        threadId: m.threadId,
        from: m.from,
        subject: m.subject,
        snippet: m.snippet,
        receivedAt: m.date,
        labelIds: m.labelIds,
        unread: m.unread,
        matchedQueries: [query],
      });

      if (recorded.isNew) {
        newMatches++;
        if (notifyEmail && !firstRun) {
          await sendAlert(accessToken, {
            to: notifyEmail,
            from: auth.accountEmail,
            subject: `Graduation email: ${m.subject}`,
            text: [
              `A new email matching "${query}" arrived in ${auth.accountEmail}.`,
              "",
              `From: ${m.from}`,
              `Subject: ${m.subject}`,
              `Date: ${new Date(m.date).toUTCString()}`,
              "",
              m.snippet,
              "",
              `Open in Gmail: ${m.url}`,
            ].join("\n"),
          });
          await ctx.runMutation(internal.messages.markNotified, {
            id: recorded.id,
            at: Date.now(),
          });
          alerted++;
        }
      }
    }

    await ctx.runMutation(internal.messages.setSyncState, {
      key: "gmail",
      lastPolledAt: Date.now(),
      lastError: "",
      lastMessageAt: found[0]?.date,
    });

    return {
      ok: true,
      query,
      email: auth.accountEmail,
      checked: found.length,
      newMatches,
      alerted,
      notifyEmail,
      firstRun,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await ctx.runMutation(internal.messages.setSyncState, {
      key: "gmail",
      lastPolledAt: Date.now(),
      lastError: message,
    });
    return { ok: false, error: message, checked: 0, newMatches: 0 };
  }
}

// Runs on the daily cron.
export const checkGraduation = internalAction({
  args: { query: v.optional(v.string()) },
  handler: async (ctx, args) => {
    return await runCheck(ctx, args.query?.trim() || "graduation");
  },
});

// Manual trigger (used by the dashboard's "Run check now").
export const runCheckNow = action({
  args: { secret: v.string(), query: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.secret !== process.env.AUTH_SECRET) {
      throw new Error("Unauthorized");
    }
    return await runCheck(ctx, args.query?.trim() || "graduation");
  },
});

export const listInbox = action({
  args: { secret: v.string(), maxResults: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const auth = await getAccessTokenFor(ctx, args.secret);
    if (!auth) {
      return { connected: false as const, messages: [] as InboxMessage[] };
    }
    const messages = await fetchMessages(auth.accessToken, {
      labelIds: ["INBOX"],
      maxResults: clamp(args.maxResults),
    });
    return { connected: true as const, email: auth.accountEmail, messages };
  },
});

// Full-text search across the mailbox using Gmail query syntax
// (e.g. `subject:graduation`, `from:registrar@school.edu`, `is:unread`).
export const search = action({
  args: {
    secret: v.string(),
    query: v.string(),
    maxResults: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const auth = await getAccessTokenFor(ctx, args.secret);
    if (!auth) {
      return { connected: false as const, messages: [] as InboxMessage[] };
    }
    const query = args.query.trim();
    if (!query) {
      return {
        connected: true as const,
        email: auth.accountEmail,
        messages: [] as InboxMessage[],
      };
    }
    const messages = await fetchMessages(auth.accessToken, {
      query,
      maxResults: clamp(args.maxResults, 25),
    });
    return { connected: true as const, email: auth.accountEmail, messages };
  },
});

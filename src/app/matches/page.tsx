import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { api } from "@convex/_generated/api";
import { getConvexClient } from "@/lib/convex";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";

function formatDate(ms: number | undefined): string {
  if (!ms) return "—";
  const d = new Date(ms);
  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date} · ${time}`;
}

function senderName(from: string): string {
  const match = from.match(/^\s*"?([^"<]+?)"?\s*<.*>\s*$/);
  return (match?.[1] ?? from).trim() || from;
}

export default async function MatchesPage() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) redirect("/");

  const client = getConvexClient();
  const [matches, status, authStatus] = await Promise.all([
    client.query(api.messages.list, { limit: 50 }),
    client.query(api.messages.syncStatus, {}),
    client.query(api.auth.getAuthStatus, {}),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Graduation matches
          </h1>
          <p className="text-sm text-foreground/60">
            {authStatus?.accountEmail ?? "No account connected"}
            {" · "}
            Last checked: {formatDate(status?.lastPolledAt)}
          </p>
          {status?.lastError ? (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              Last error: {status.lastError}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-2">
          <a
            href="/api/cron/graduation"
            className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background transition hover:opacity-90"
          >
            Run check now
          </a>
          <Link
            href="/inbox"
            className="rounded-full border border-black/10 px-4 py-1.5 text-sm text-foreground/70 transition hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
          >
            Inbox
          </Link>
        </div>
      </div>

      <p className="mt-4 text-xs text-foreground/50">
        A cron job searches for <code className="font-mono">graduation</code>{" "}
        every day at 06:17 UTC, looking back over the{" "}
        <strong>last 3 days</strong>, and emails new matches to your alert
        address.
      </p>

      <ul className="mt-6 divide-y divide-black/5 overflow-hidden rounded-xl border border-black/10 dark:divide-white/10 dark:border-white/10">
        {matches.length === 0 ? (
          <li className="px-4 py-6 text-sm text-foreground/60">
            No graduation emails found yet. Click “Run check now”.
          </li>
        ) : (
          matches.map((m) => (
            <li key={m._id}>
              <a
                href={`https://mail.google.com/mail/u/0/#all/${m.gmailId}`}
                target="_blank"
                rel="noreferrer"
                className="flex gap-3 px-4 py-3 transition hover:bg-black/[.03] dark:hover:bg-white/[.05]"
              >
                <span
                  className={`mt-2 h-2 w-2 shrink-0 rounded-full ${
                    m.unread ? "bg-blue-500" : "bg-transparent"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-medium">
                      {senderName(m.from)}
                    </span>
                    <span className="shrink-0 text-xs text-foreground/50">
                      {formatDate(m.receivedAt)}
                    </span>
                  </div>
                  <div className="truncate text-sm text-foreground/80">
                    {m.subject}
                  </div>
                  <div className="truncate text-xs text-foreground/50">
                    {m.snippet}
                  </div>
                  {m.notifiedAt ? (
                    <div className="mt-1 text-xs text-green-600 dark:text-green-400">
                      Alert sent {formatDate(m.notifiedAt)}
                    </div>
                  ) : null}
                </div>
              </a>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

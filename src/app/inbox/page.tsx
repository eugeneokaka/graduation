import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { api } from "@convex/_generated/api";
import { getConvexClient } from "@/lib/convex";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";

type InboxMessage = {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  date: number;
  unread: boolean;
  url: string;
};

function formatDate(ms: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) redirect("/");

  let result:
    | {
        connected: boolean;
        email?: string;
        messages: InboxMessage[];
      }
    | undefined;
  let error: string | null = null;

  try {
    const client = getConvexClient();
    const secret = process.env.AUTH_SECRET ?? "";
    result = query
      ? await client.action(api.gmail.search, { secret, query, maxResults: 25 })
      : await client.action(api.gmail.listInbox, { secret, maxResults: 25 });
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to load inbox";
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {query ? "Filtered mail" : "Inbox"}
          </h1>
          {result?.connected ? (
            <p className="text-sm text-foreground/60">
              {result.email}
              {query ? (
                <>
                  {" · "}
                  <span className="font-mono text-foreground/70">{query}</span>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
        {query ? (
          <Link
            href="/inbox"
            className="rounded-full border border-black/10 px-3 py-1.5 text-sm text-foreground/70 transition hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
          >
            Clear
          </Link>
        ) : (
          <Link
            href="/inbox"
            className="rounded-full border border-black/10 px-3 py-1.5 text-sm text-foreground/70 transition hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
          >
            Refresh
          </Link>
        )}
      </div>

      <form action="/inbox" method="get" className="mt-6 flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="Filter mail — e.g. subject:graduation, from:registrar@school.edu, is:unread"
          className="min-w-0 flex-1 rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm outline-none transition focus:border-foreground/40 dark:border-white/15"
        />
        <button
          type="submit"
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:opacity-90"
        >
          Filter
        </button>
      </form>

      {error ? (
        <div className="mt-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      ) : null}

      {result && !result.connected ? (
        <div className="mt-8 rounded-xl border border-black/10 bg-white/60 p-6 text-sm dark:border-white/10 dark:bg-white/5">
          No Gmail account connected.{" "}
          <Link href="/" className="font-medium underline">
            Connect one
          </Link>
          .
        </div>
      ) : null}

      {result?.connected ? (
        <ul className="mt-6 divide-y divide-black/5 overflow-hidden rounded-xl border border-black/10 dark:divide-white/10 dark:border-white/10">
          {result.messages.length === 0 ? (
            <li className="px-4 py-6 text-sm text-foreground/60">
              {query
                ? "No messages match this filter."
                : "Your inbox is empty."}
            </li>
          ) : (
            result.messages.map((m) => (
              <li key={m.id}>
                <a
                  href={m.url}
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
                      <span
                        className={`truncate text-sm ${
                          m.unread
                            ? "font-semibold"
                            : "font-medium text-foreground/80"
                        }`}
                      >
                        {senderName(m.from)}
                      </span>
                      <span className="shrink-0 text-xs text-foreground/50">
                        {formatDate(m.date)}
                      </span>
                    </div>
                    <div
                      className={`truncate text-sm ${
                        m.unread ? "font-medium" : "text-foreground/80"
                      }`}
                    >
                      {m.subject}
                    </div>
                    <div className="truncate text-xs text-foreground/50">
                      {m.snippet}
                    </div>
                  </div>
                </a>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

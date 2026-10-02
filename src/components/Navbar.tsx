import Link from "next/link";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

export default async function Navbar() {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);

  return (
    <header className="sticky top-0 z-10 border-b border-black/10 bg-background/80 backdrop-blur dark:border-white/10">
      <nav className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-red-500 text-xs text-white">
            G
          </span>
          Gmail Alerts
        </Link>

        {session ? (
          <div className="flex items-center gap-3 text-sm">
            <Link
              href="/inbox"
              className="hidden text-foreground/80 transition hover:text-foreground sm:inline"
            >
              Inbox
            </Link>
            <Link
              href="/matches"
              className="hidden text-foreground/80 transition hover:text-foreground sm:inline"
            >
              Matches
            </Link>
            {session.picture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={session.picture}
                alt=""
                className="h-7 w-7 rounded-full"
              />
            ) : (
              <span className="grid h-7 w-7 place-items-center rounded-full bg-black/10 text-xs font-medium dark:bg-white/15">
                {session.email.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="hidden text-foreground/80 sm:inline">
              {session.email}
            </span>
            <a
              href="/api/auth/logout"
              className="rounded-md border border-black/10 px-2.5 py-1 text-foreground/70 transition hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
            >
              Sign out
            </a>
          </div>
        ) : (
          <a
            href="/api/auth/start"
            className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background transition hover:opacity-90"
          >
            Sign in with Google
          </a>
        )}
      </nav>
    </header>
  );
}

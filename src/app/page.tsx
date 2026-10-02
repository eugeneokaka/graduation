import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: "You cancelled the Google sign-in.",
  missing_code: "Google did not return an authorization code.",
  state_mismatch: "The sign-in request could not be verified. Please try again.",
  not_allowed: "That Google account is not allowed to use this app.",
  oauth_failed: "Something went wrong during sign-in. Please try again.",
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-8 px-4 py-16">
      {error ? (
        <div className="w-full rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {ERROR_MESSAGES[error] ?? "Sign-in failed."}
        </div>
      ) : null}

      <div className="w-full rounded-2xl border border-black/10 bg-white/60 p-8 shadow-sm dark:border-white/10 dark:bg-white/5">
        <h1 className="text-3xl font-semibold tracking-tight">
          Gmail Graduation Alerts
        </h1>
        <p className="mt-3 text-foreground/70">
          Connect your school Gmail account and this app will watch for emails
          about graduation and alert your personal inbox.
        </p>

        {session ? (
          <div className="mt-8 space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-black/10 bg-background px-4 py-3 dark:border-white/10">
              {session.picture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={session.picture}
                  alt=""
                  className="h-10 w-10 rounded-full"
                />
              ) : (
                <span className="grid h-10 w-10 place-items-center rounded-full bg-black/10 font-medium dark:bg-white/15">
                  {session.email.charAt(0).toUpperCase()}
                </span>
              )}
              <div className="leading-tight">
                <p className="text-xs uppercase tracking-wide text-foreground/50">
                  Connected
                </p>
                <p className="font-medium">{session.email}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <a
                href="/inbox"
                className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition hover:opacity-90"
              >
                View your inbox
              </a>
              <a
                href="/api/auth/disconnect"
                className="text-sm text-foreground/60 underline transition hover:text-foreground"
              >
                Disconnect / switch account
              </a>
            </div>
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            <a
              href="/api/auth/start"
              className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition hover:opacity-90"
            >
              Connect your school Gmail
            </a>
            <p className="text-xs text-foreground/50">
              You&apos;ll be asked to grant read and send access to Gmail.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

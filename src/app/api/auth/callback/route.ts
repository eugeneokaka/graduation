import { NextResponse, type NextRequest } from "next/server";
import { api } from "@convex/_generated/api";
import { exchangeCode, getUserInfo } from "@/lib/google";
import { getConvexClient } from "@/lib/convex";
import { createSessionToken, SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const cookieState = request.cookies.get("oauth_state")?.value;

  const redirectTo = (path: string) =>
    NextResponse.redirect(new URL(path, origin));

  if (error) return redirectTo(`/?error=${encodeURIComponent(error)}`);
  if (!code) return redirectTo("/?error=missing_code");
  if (!state || !cookieState || state !== cookieState) {
    return redirectTo("/?error=state_mismatch");
  }

  try {
    const tokens = await exchangeCode(code);
    const user = await getUserInfo(tokens.access_token);

    const allowed = process.env.ALLOWED_EMAIL?.trim();
    if (allowed && user.email.toLowerCase() !== allowed.toLowerCase()) {
      return redirectTo("/?error=not_allowed");
    }

    if (tokens.refresh_token) {
      await getConvexClient().mutation(api.auth.saveAuth, {
        secret: process.env.AUTH_SECRET ?? "",
        accountEmail: user.email,
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token,
        accessTokenExpiresAt: Date.now() + tokens.expires_in * 1000,
        scope: tokens.scope,
      });
    }

    const res = redirectTo("/");
    res.cookies.set(
      SESSION_COOKIE,
      createSessionToken({
        email: user.email,
        name: user.name,
        picture: user.picture,
      }),
      {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
        secure: process.env.NODE_ENV === "production",
      },
    );
    res.cookies.delete("oauth_state");
    return res;
  } catch (err) {
    console.error("OAuth callback error:", err);
    return redirectTo("/?error=oauth_failed");
  }
}

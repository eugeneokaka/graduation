import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { api } from "@convex/_generated/api";
import { buildAuthUrl } from "@/lib/google";
import { getConvexClient } from "@/lib/convex";

export const runtime = "nodejs";

export async function GET() {
  const state = randomBytes(16).toString("hex");

  // Only force the consent screen until the account has connected once.
  let forceConsent = true;
  try {
    const existing = await getConvexClient().query(api.auth.getAuthStatus, {});
    if (existing) forceConsent = false;
  } catch {
    // If Convex is unreachable, fall back to the full consent flow.
  }

  const res = NextResponse.redirect(buildAuthUrl(state, forceConsent));
  res.cookies.set("oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}

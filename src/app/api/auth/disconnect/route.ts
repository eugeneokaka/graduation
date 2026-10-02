import { NextResponse, type NextRequest } from "next/server";
import { api } from "@convex/_generated/api";
import { getConvexClient } from "@/lib/convex";
import { SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const res = NextResponse.redirect(new URL("/", request.nextUrl.origin));
  try {
    await getConvexClient().mutation(api.auth.clearAuth, {
      secret: process.env.AUTH_SECRET ?? "",
    });
  } catch (err) {
    console.error("Disconnect error:", err);
  }
  res.cookies.delete(SESSION_COOKIE);
  return res;
}

import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { api } from "@convex/_generated/api";
import { getConvexClient } from "@/lib/convex";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const session = verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.redirect(new URL("/", request.nextUrl.origin));
  }

  try {
    await getConvexClient().action(api.gmail.runCheckNow, {
      secret: process.env.AUTH_SECRET ?? "",
    });
  } catch (err) {
    console.error("Graduation check error:", err);
  }

  return NextResponse.redirect(new URL("/matches", request.nextUrl.origin));
}

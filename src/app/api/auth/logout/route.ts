import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const res = NextResponse.redirect(new URL("/", request.nextUrl.origin));
  res.cookies.delete(SESSION_COOKIE);
  return res;
}

import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/cookie";

// Sessions are stateless (lib/auth/session-token.ts) — there's no server-side
// row to delete, so signing out is just clearing the cookie.
export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}

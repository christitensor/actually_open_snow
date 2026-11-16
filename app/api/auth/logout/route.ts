import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/cookie";
import { resolveSession, revokeSession } from "@/lib/auth/sessions";

// Signs out this browser: revokes its session row and clears the cookie.
export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    const resolved = await resolveSession(token, null).catch(() => null);
    if (resolved) await revokeSession(resolved.user.id, resolved.user.sessionId).catch(() => {});
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}

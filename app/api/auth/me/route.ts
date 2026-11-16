import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/cookie";
import { resolveSession, setSessionCookie } from "@/lib/auth/sessions";
import { getSql } from "@/lib/db/postgres";

// Who's signed in on this browser. Called by lib/auth.tsx on load; also
// where a session rolls forward (cookie re-sent with a later expiry) and an
// old-style token gets upgraded, so simply opening the app keeps you signed in.
export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ email: null });
  try {
    const resolved = await resolveSession(token, req.headers.get("user-agent"));
    if (!resolved) {
      const res = NextResponse.json({ email: null });
      res.cookies.delete(SESSION_COOKIE);
      return res;
    }
    const sql = await getSql();
    const [{ n }] = (await sql`SELECT count(*)::int AS n FROM passkeys WHERE user_id = ${resolved.user.id}`) as { n: number }[];
    const res = NextResponse.json({ email: resolved.user.email, hasPasskey: n > 0 });
    if (resolved.refresh) setSessionCookie(res, resolved.refresh.token, resolved.refresh.expiresAt);
    return res;
  } catch {
    // DB hiccup: don't clear the cookie, just report unknown-as-signed-out for now.
    return NextResponse.json({ email: null, error: "unavailable" }, { status: 503 });
  }
}

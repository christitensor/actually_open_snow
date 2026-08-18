import { NextRequest, NextResponse } from "next/server";
import { consumeMagicLink, createSession, getOrCreateUser } from "@/lib/db/users";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/auth/cookie";

// PERS-04: the link target from the sign-in email. Burns the token,
// creates (or reuses) the account, starts a session, and redirects home —
// designed to be clicked, not fetched, so it returns a redirect rather
// than JSON. `signedIn=1` on the redirect tells the client to import any
// localStorage favorites into the new account (see lib/auth.tsx).
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const next = req.nextUrl.searchParams.get("next");
  const nextPath = next && next.startsWith("/") ? next : "/";

  const email = token ? consumeMagicLink(token) : null;
  if (!email) {
    const url = new URL("/", req.url);
    url.searchParams.set("signInError", "1");
    return NextResponse.redirect(url);
  }

  const user = getOrCreateUser(email);
  const { token: sessionToken, expiresAt } = createSession(user.id);

  const url = new URL(nextPath, req.url);
  url.searchParams.set("signedIn", "1");
  const response = NextResponse.redirect(url);
  response.cookies.set(SESSION_COOKIE, sessionToken, { ...SESSION_COOKIE_OPTIONS, expires: expiresAt });
  return response;
}

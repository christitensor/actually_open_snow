import { NextRequest, NextResponse } from "next/server";
import { consumeMagicLinkByCode, createSession, getOrCreateUser } from "@/lib/db/users";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/auth/cookie";
import { badRequest } from "@/lib/util/api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// PERS-04: the in-app counterpart to /api/auth/verify. A magic link tapped
// from Mail always opens in Safari, never the saved-to-home-screen app
// (separate storage silo on iOS), so it can't sign that app in. This lets
// someone who already has the app open finish sign-in there directly —
// same effect as the link, just started from a same-origin fetch instead
// of a top-level navigation, so the session cookie lands in the right place.
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Request body must be JSON");
  }

  const { email, code } = body as Record<string, unknown>;
  if (typeof email !== "string" || !EMAIL_RE.test(email)) return badRequest("A valid email is required");
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) return badRequest("A valid 6-digit code is required");

  const valid = consumeMagicLinkByCode(email, code);
  if (!valid) return NextResponse.json({ error: "That code is invalid, expired, or already used." }, { status: 400 });

  const user = getOrCreateUser(email);
  const { token: sessionToken, expiresAt } = createSession(user.id, user.email);

  const response = NextResponse.json({ email: user.email });
  response.cookies.set(SESSION_COOKIE, sessionToken, { ...SESSION_COOKIE_OPTIONS, expires: expiresAt });
  return response;
}

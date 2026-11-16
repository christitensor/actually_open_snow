import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUser } from "@/lib/db/users";
import { verifyMagicLinkCode } from "@/lib/auth/magic-link";
import { createSession, setSessionCookie } from "@/lib/auth/sessions";
import { hit, peek } from "@/lib/auth/rate-limit";
import { badRequest } from "@/lib/util/api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// A 6-digit code has a million values; cap guesses per email per 15 minutes.
const MAX_GUESSES = 6;

// PERS-04: sign in with the 6-digit emailed code, typed into the app. This
// is the primary email path because it works inside an iOS home-screen app,
// where a tapped email link would open Safari instead.
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Request body must be JSON");
  }

  const { email: rawEmail, code } = body as Record<string, unknown>;
  if (typeof rawEmail !== "string" || !EMAIL_RE.test(rawEmail.trim())) return badRequest("A valid email is required");
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) return badRequest("Enter the 6-digit code from the email.");
  const email = rawEmail.trim().toLowerCase();

  const guesses = await hit(`guess:${email}`, MAX_GUESSES);
  if (!guesses.ok) {
    return NextResponse.json({ error: "Too many tries. Wait 15 minutes, then request a new code." }, { status: 429 });
  }
  if ((await peek(`used:${email}:${code}`)) > 0 || !verifyMagicLinkCode(email, code)) {
    return NextResponse.json({ error: "That code is wrong or has expired. Check the latest email, or send a new code." }, { status: 400 });
  }
  await hit(`used:${email}:${code}`, 1); // one-time use

  const user = await getOrCreateUser(email);
  const session = await createSession(user.id, req.headers.get("user-agent"));
  const response = NextResponse.json({ email: user.email });
  setSessionCookie(response, session.token, session.expiresAt);
  return response;
}

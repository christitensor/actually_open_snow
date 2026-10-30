import { NextRequest, NextResponse } from "next/server";
import { createSession, getOrCreateUser } from "@/lib/db/users";
import { consumeSignInCode } from "@/lib/db/auth-codes";
import { isPostgresConfigured } from "@/lib/db/postgres";
import { hitRateLimit } from "@/lib/db/rate-limit";
import { parseEmail } from "@/lib/auth/email";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/auth/cookie";
import { badRequest } from "@/lib/util/api";
import { clientIp } from "@/lib/util/client-ip";

// Each code already dies after MAX_CODE_ATTEMPTS guesses (lib/db/auth-codes.ts);
// these stop one client from grinding through many accounts' codes at once.
const VERIFY_PER_IP_PER_15_MIN = 30;
const VERIFY_PER_EMAIL_PER_HOUR = 20;

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

  const { email: rawEmail, code: rawCode } = body as Record<string, unknown>;
  const email = parseEmail(rawEmail);
  const code = typeof rawCode === "string" ? rawCode.trim() : rawCode;
  if (!email) return badRequest("A valid email is required");
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) return badRequest("A valid 6-digit code is required");
  if (!isPostgresConfigured) return NextResponse.json({ error: "Sign-in isn't available on this server." }, { status: 503 });

  try {
    const ipOk = await hitRateLimit(`verify:ip:${clientIp(req)}`, VERIFY_PER_IP_PER_15_MIN, 15 * 60);
    const emailOk = ipOk && (await hitRateLimit(`verify:email:${email}`, VERIFY_PER_EMAIL_PER_HOUR, 3600));
    if (!ipOk || !emailOk) {
      return NextResponse.json({ error: "Too many attempts — wait a bit and try again." }, { status: 429 });
    }

    const valid = await consumeSignInCode(email, code);
    if (!valid) {
      return NextResponse.json(
        { error: "That code is invalid, expired, or already used. After 5 wrong tries a code stops working — request a new one." },
        { status: 400 }
      );
    }

    const user = await getOrCreateUser(email);
    const { token: sessionToken, expiresAt } = createSession(user.id, user.email);

    const response = NextResponse.json({ email: user.email });
    response.cookies.set(SESSION_COOKIE, sessionToken, { ...SESSION_COOKIE_OPTIONS, expires: expiresAt });
    return response;
  } catch (err) {
    console.error("Code verification failed:", err);
    return NextResponse.json({ error: "Couldn't verify the code right now — try again." }, { status: 502 });
  }
}

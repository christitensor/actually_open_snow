import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUser } from "@/lib/db/users";
import { consumeSignInCode } from "@/lib/db/auth-codes";
import { isPostgresConfigured } from "@/lib/db/postgres";
import { hitRateLimit } from "@/lib/db/rate-limit";
import { parseEmail } from "@/lib/auth/email";
import { createSession, setSessionCookie } from "@/lib/auth/sessions";
import { badRequest } from "@/lib/util/api";
import { clientIp } from "@/lib/util/client-ip";

// Each code already dies after MAX_CODE_ATTEMPTS guesses (lib/db/auth-codes.ts);
// these stop one client from grinding through many accounts' codes at once.
const VERIFY_PER_IP_PER_15_MIN = 30;
const VERIFY_PER_EMAIL_PER_HOUR = 20;

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

  const { email: rawEmail, code: rawCode } = body as Record<string, unknown>;
  const email = parseEmail(rawEmail);
  const code = typeof rawCode === "string" ? rawCode.trim() : rawCode;
  if (!email) return badRequest("A valid email is required");
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) return badRequest("Enter the 6-digit code from the email.");
  if (!isPostgresConfigured) return NextResponse.json({ error: "Sign-in isn't available on this server." }, { status: 503 });

  try {
    const ipOk = await hitRateLimit(`verify:ip:${clientIp(req)}`, VERIFY_PER_IP_PER_15_MIN, 15 * 60);
    const emailOk = ipOk && (await hitRateLimit(`verify:email:${email}`, VERIFY_PER_EMAIL_PER_HOUR, 3600));
    if (!ipOk || !emailOk) {
      return NextResponse.json({ error: "Too many tries — wait a bit, then request a new code." }, { status: 429 });
    }

    const valid = await consumeSignInCode(email, code);
    if (!valid) {
      return NextResponse.json(
        { error: "That code is wrong, expired, or already used. Check the latest email, or send a new code (after 5 wrong tries a code stops working)." },
        { status: 400 }
      );
    }

    const user = await getOrCreateUser(email);
    const session = await createSession(user.id, req.headers.get("user-agent"));
    const response = NextResponse.json({ email: user.email, created: user.created });
    setSessionCookie(response, session.token, session.expiresAt);
    return response;
  } catch (err) {
    console.error("Code verification failed:", err);
    return NextResponse.json({ error: "Couldn't verify the code right now — try again." }, { status: 502 });
  }
}

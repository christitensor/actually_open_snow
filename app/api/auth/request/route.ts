import { NextRequest, NextResponse } from "next/server";
import { createMagicLinkToken, generateSignInCode } from "@/lib/auth/magic-link";
import { parseEmail } from "@/lib/auth/email";
import { storeSignInCode } from "@/lib/db/auth-codes";
import { isPostgresConfigured } from "@/lib/db/postgres";
import { hitRateLimit } from "@/lib/db/rate-limit";
import { sendEmail } from "@/lib/email";
import { badRequest, safeNextPath } from "@/lib/util/api";
import { clientIp } from "@/lib/util/client-ip";

// Per-email caps how many fresh codes (each worth MAX_CODE_ATTEMPTS guesses)
// an attacker can mint for one victim, and how often a victim's inbox can be
// spammed. Per-IP caps one client spraying many addresses.
const REQUESTS_PER_EMAIL_PER_HOUR = 5;
const REQUESTS_PER_IP_PER_HOUR = 20;

// PERS-04: request a magic sign-in link. Always responds with the same
// "check your email" message regardless of whether the send actually
// succeeded (see lib/email.ts — without RESEND_API_KEY configured it logs
// instead of sending), matching this endpoint's low-stakes nature: there's
// nothing sensitive to leak by confirming an email is or isn't registered,
// since any email can just sign up.
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Request body must be JSON");
  }

  const { email: rawEmail, next } = body as Record<string, unknown>;
  const email = parseEmail(rawEmail);
  if (!email) return badRequest("A valid email is required");
  const nextPath = safeNextPath(next);

  // Accounts, codes and throttles all live in Postgres; without it sign-in can't complete anyway.
  if (!isPostgresConfigured) return NextResponse.json({ error: "Sign-in isn't available on this server." }, { status: 503 });

  try {
    const ipOk = await hitRateLimit(`request:ip:${clientIp(req)}`, REQUESTS_PER_IP_PER_HOUR, 3600);
    const emailOk = ipOk && (await hitRateLimit(`request:email:${email}`, REQUESTS_PER_EMAIL_PER_HOUR, 3600));
    if (!ipOk || !emailOk) {
      return NextResponse.json({ error: "Too many sign-in requests — wait a bit and try again." }, { status: 429 });
    }

    const { token } = createMagicLinkToken(email);
    const code = generateSignInCode();
    await storeSignInCode(email, code);
    const origin = req.nextUrl.origin;
    const verifyUrl = `${origin}/api/auth/verify?token=${token}&next=${encodeURIComponent(nextPath)}`;

    await sendEmail({
      to: email,
      subject: "Sign in to Actually Open Snow",
      text: `Click to sign in: ${verifyUrl}\n\nUsing this saved to your home screen? Tapping the link above opens Safari instead of the saved app, so it won't sign that in. Open the app and enter this code instead: ${code}\n\nThe link and code expire in 15 minutes, and the code works once (requesting another one replaces it). If you didn't request this, ignore it.`,
    });

    return NextResponse.json({ message: `Check ${email} for a sign-in link and code.` });
  } catch (err) {
    console.error("Sign-in request failed:", err);
    return NextResponse.json({ error: "Couldn't send a sign-in email right now — try again." }, { status: 502 });
  }
}

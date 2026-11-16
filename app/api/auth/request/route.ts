import { NextRequest, NextResponse } from "next/server";
import { createMagicLinkToken, magicLinkCode } from "@/lib/auth/magic-link";
import { sendEmail } from "@/lib/email";
import { badRequest, serverError } from "@/lib/util/api";
import { hit } from "@/lib/auth/rate-limit";

// Sends per email per 15 minutes, so the form can't be used to flood an inbox.
const MAX_SENDS = 4;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  if (typeof rawEmail !== "string" || !EMAIL_RE.test(rawEmail.trim())) return badRequest("A valid email is required");
  const email = rawEmail.trim().toLowerCase();
  const nextPath = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  try {
    const send = await hit(`send:${email}`, MAX_SENDS);
    if (!send.ok) {
      return NextResponse.json({ error: "Several codes were already sent. Use the latest one, or try again in 15 minutes." }, { status: 429 });
    }
    const { token } = createMagicLinkToken(email);
    const code = magicLinkCode(email, send.count); // a different code for each send
    const origin = req.nextUrl.origin;
    const verifyUrl = `${origin}/api/auth/verify?token=${token}&next=${encodeURIComponent(nextPath)}`;

    await sendEmail({
      to: email,
      subject: `${code} is your Actually Open Snow code`,
      text: `Your sign-in code: ${code}\n\nEnter it in the app where you asked for it. It expires in 15 minutes.\n\nOr sign in this browser with this link: ${verifyUrl}\n\nTip: once you're in, add a passkey (Account → Sign-in methods) and next time it's just Face ID or Touch ID, on any of your devices.\n\nIf you didn't request this, ignore this email.`,
    });

    return NextResponse.json({ message: `We sent a 6-digit code to ${email}.` });
  } catch (err) {
    return serverError(err);
  }
}

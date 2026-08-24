import { NextRequest, NextResponse } from "next/server";
import { createMagicLinkToken, currentMagicLinkCode } from "@/lib/auth/magic-link";
import { sendEmail } from "@/lib/email";
import { badRequest, serverError } from "@/lib/util/api";

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

  const { email, next } = body as Record<string, unknown>;
  if (typeof email !== "string" || !EMAIL_RE.test(email)) return badRequest("A valid email is required");
  const nextPath = typeof next === "string" && next.startsWith("/") ? next : "/";

  try {
    const { token } = createMagicLinkToken(email);
    const code = currentMagicLinkCode(email);
    const origin = req.nextUrl.origin;
    const verifyUrl = `${origin}/api/auth/verify?token=${token}&next=${encodeURIComponent(nextPath)}`;

    await sendEmail({
      to: email,
      subject: "Sign in to Actually Open Snow",
      text: `Click to sign in: ${verifyUrl}\n\nUsing this saved to your home screen? Tapping the link above opens Safari instead of the saved app, so it won't sign that in. Open the app and enter this code instead: ${code}\n\nThe link and code both work once and expire in 15 minutes. If you didn't request this, ignore it.`,
    });

    return NextResponse.json({ message: `Check ${email} for a sign-in link and code.` });
  } catch (err) {
    return serverError(err);
  }
}

import { NextResponse } from "next/server";

// PERS-04 support: with no tool available to read/set Vercel project env
// vars directly, this is the only way to tell "RESEND_API_KEY was never
// set" apart from "it's set" without guessing. Never returns the key
// itself — only booleans.
//
// Deliberately does NOT probe Resend's API (e.g. GET /domains) to verify
// the key works: Resend API keys can be scoped to "Sending access" only,
// which is allowed to call POST /emails (what sendEmail() actually does)
// but gets a 401 from /domains and most other endpoints — a restricted,
// working key looks identical to a revoked one from that angle. Confirmed
// live: this app's key produced 401 from /domains while Resend's own
// dashboard showed those same emails as "Delivered". The Resend dashboard
// (resend.com → Emails) is the only reliable way to confirm delivery.
export async function GET() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ALERTS_FROM_EMAIL;

  return NextResponse.json({
    resendApiKeyConfigured: !!apiKey,
    fromEmailConfigured: !!from,
    detail:
      !apiKey || !from
        ? `${!apiKey ? "RESEND_API_KEY" : "ALERTS_FROM_EMAIL"} is not set in this deployment's environment variables.`
        : "Both env vars are set. This endpoint can't verify the key actually sends (a restricted 'sending access' key fails unrelated Resend API checks) — check resend.com → Emails for real delivery status instead.",
  });
}

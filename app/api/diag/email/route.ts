import { NextResponse } from "next/server";
import { serverError } from "@/lib/util/api";

// PERS-04 support: with no tool available to read/set Vercel project env
// vars directly, this is the only way to tell "RESEND_API_KEY was never
// set" apart from "it's set but wrong/unverified domain" without guessing.
// Never returns the key itself — only booleans and Resend's own error text
// (which describes the auth/domain problem, not secrets).
export async function GET() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ALERTS_FROM_EMAIL;

  if (!apiKey) return NextResponse.json({ resendApiKeyConfigured: false, fromEmailConfigured: !!from, resendAuthOk: null, detail: "RESEND_API_KEY is not set in this deployment's environment variables." });
  if (!from) return NextResponse.json({ resendApiKeyConfigured: true, fromEmailConfigured: false, resendAuthOk: null, detail: "ALERTS_FROM_EMAIL is not set in this deployment's environment variables." });

  try {
    const res = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${apiKey}` } });
    if (res.status === 401 || res.status === 403) {
      return NextResponse.json({ resendApiKeyConfigured: true, fromEmailConfigured: true, resendAuthOk: false, detail: "Resend rejected the API key (unauthorized) — it may be invalid or revoked." });
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return NextResponse.json({ resendApiKeyConfigured: true, fromEmailConfigured: true, resendAuthOk: false, detail: `Resend API returned ${res.status}: ${body.slice(0, 300)}` });
    }
    const body = (await res.json()) as { data?: { name: string; status: string }[] };
    const domains = (body.data ?? []).map((d) => `${d.name} (${d.status})`);
    return NextResponse.json({
      resendApiKeyConfigured: true,
      fromEmailConfigured: true,
      resendAuthOk: true,
      fromEmail: from,
      verifiedDomains: domains,
      detail: domains.length > 0 ? "Key is valid. Confirm ALERTS_FROM_EMAIL's domain appears above as 'verified'." : "Key is valid, but no domains are registered on this Resend account — ALERTS_FROM_EMAIL's domain must be added and verified in the Resend dashboard, or use a resend.dev sandbox address for testing.",
    });
  } catch (err) {
    return serverError(err);
  }
}

// PERS-03 notification delivery. Pluggable by design: if RESEND_API_KEY
// is set, sends a real email via Resend's HTTP API (no SDK dependency,
// one fetch call). If not, logs what *would* have been sent and returns
// sent: false — this repo has no email credentials of its own, so
// without a key configured, alerts are computed and deduped correctly
// but not actually delivered. That's an honest, functional "not fully
// wired" state, not a fake success.

const RESEND_API_URL = "https://api.resend.com/emails";

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
}

export interface SendEmailResult {
  sent: boolean;
  provider: "resend" | "none-configured";
  error?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ALERTS_FROM_EMAIL;

  if (!apiKey || !from) {
    console.log(
      `[email:not-configured] Would send to ${input.to}: "${input.subject}" — set RESEND_API_KEY and ALERTS_FROM_EMAIL to actually send.\n${input.text}`
    );
    return { sent: false, provider: "none-configured" };
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: input.to, subject: input.subject, text: input.text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[email:resend] send failed (${res.status}): ${body}`);
      return { sent: false, provider: "resend", error: `${res.status}: ${body}` };
    }
    return { sent: true, provider: "resend" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[email:resend] send threw: ${message}`);
    return { sent: false, provider: "resend", error: message };
  }
}

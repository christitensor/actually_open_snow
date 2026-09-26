// PERS-06: Web Push sender. Like lib/email.ts, this repo holds no
// credentials of its own — VAPID keys come from env (generate once with
// `npx web-push generate-vapid-keys`). Without them, isPushConfigured is
// false and the UI/API say so instead of pretending to subscribe.
import webpush from "web-push";
import { deleteAllForEndpoint, type PushKeys } from "@/lib/db/push-subscriptions";

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
// Push services require a contact URI for the sender; mailto: or https: both work.
const SUBJECT = process.env.VAPID_SUBJECT ?? process.env.APP_URL ?? "mailto:alerts@example.com";

export const isPushConfigured = Boolean(PUBLIC_KEY && PRIVATE_KEY);
export const vapidPublicKey = PUBLIC_KEY ?? null;

let configured = false;
function ensureConfigured() {
  if (configured) return;
  if (!PUBLIC_KEY || !PRIVATE_KEY) throw new Error("VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set");
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
  configured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Path to open when the notification is tapped. */
  url?: string;
  /** Same tag replaces an earlier notification instead of stacking. */
  tag?: string;
}

export type SendPushResult = { sent: true } | { sent: false; gone: boolean; error: string };

export async function sendPush(keys: PushKeys, payload: PushPayload): Promise<SendPushResult> {
  ensureConfigured();
  try {
    await webpush.sendNotification(
      { endpoint: keys.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
      JSON.stringify(payload),
      // Urgency "high" asks the push service to deliver immediately even if
      // the device is idle — the whole point of a wake-up alert.
      { TTL: 60 * 60 * 3, urgency: "high" }
    );
    return { sent: true };
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    const gone = statusCode === 404 || statusCode === 410;
    if (gone) await deleteAllForEndpoint(keys.endpoint);
    return { sent: false, gone, error: err instanceof Error ? err.message : "Unknown push error" };
  }
}

// PERS-06: Web Push "wake me up" subscriptions. Keyed by the browser's push
// endpoint (one per installed app/device) plus location, so the same phone
// can watch more than one resort. No account needed — the push endpoint
// itself is the device's identity, no login. Lives in Postgres rather
// than a local SQLite file so subscriptions
// survive Vercel cold starts, which a once-a-night alarm depends on.
import { getSql } from "./postgres";

export interface PushKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushSubscriptionRecord extends PushKeys {
  id: number;
  locationName: string;
  lat: number;
  lon: number;
  thresholdIn: number;
  lastNotifiedDate: string | null;
}

interface Row {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  location_name: string;
  lat: number;
  lon: number;
  threshold_in: number;
  last_notified_date: string | null;
}

function rowToRecord(row: Row): PushSubscriptionRecord {
  return {
    id: row.id,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
    locationName: row.location_name,
    lat: row.lat,
    lon: row.lon,
    thresholdIn: row.threshold_in,
    lastNotifiedDate: row.last_notified_date,
  };
}

export async function upsertPushSubscription(input: {
  keys: PushKeys;
  locationName: string;
  lat: number;
  lon: number;
  thresholdIn: number;
}): Promise<PushSubscriptionRecord> {
  const sql = await getSql();
  const { keys, locationName, lat, lon, thresholdIn } = input;
  // Re-subscribing (e.g. changing the threshold) keeps last_notified_date so
  // it can't cause a second alarm the same morning.
  const rows = (await sql`
    INSERT INTO push_subscriptions (endpoint, p256dh, auth, location_name, lat, lon, threshold_in, created_at)
    VALUES (${keys.endpoint}, ${keys.p256dh}, ${keys.auth}, ${locationName}, ${lat}, ${lon}, ${thresholdIn}, ${new Date().toISOString()})
    ON CONFLICT (endpoint, location_name) DO UPDATE SET
      p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, lat = EXCLUDED.lat, lon = EXCLUDED.lon, threshold_in = EXCLUDED.threshold_in
    RETURNING *
  `) as Row[];
  return rowToRecord(rows[0]);
}

export async function getPushSubscription(endpoint: string, locationName: string): Promise<PushSubscriptionRecord | null> {
  const sql = await getSql();
  const rows = (await sql`
    SELECT * FROM push_subscriptions WHERE endpoint = ${endpoint} AND location_name = ${locationName}
  `) as Row[];
  return rows[0] ? rowToRecord(rows[0]) : null;
}

export async function listPushSubscriptionsForEndpoint(endpoint: string): Promise<PushSubscriptionRecord[]> {
  const sql = await getSql();
  const rows = (await sql`SELECT * FROM push_subscriptions WHERE endpoint = ${endpoint}`) as Row[];
  return rows.map(rowToRecord);
}

export async function listAllPushSubscriptions(): Promise<PushSubscriptionRecord[]> {
  const sql = await getSql();
  const rows = (await sql`SELECT * FROM push_subscriptions ORDER BY id`) as Row[];
  return rows.map(rowToRecord);
}

export async function deletePushSubscription(endpoint: string, locationName: string): Promise<boolean> {
  const sql = await getSql();
  const rows = (await sql`
    DELETE FROM push_subscriptions WHERE endpoint = ${endpoint} AND location_name = ${locationName} RETURNING id
  `) as { id: number }[];
  return rows.length > 0;
}

/** The push service said this endpoint is gone (app deleted, permission revoked) — drop every row for it. */
export async function deleteAllForEndpoint(endpoint: string): Promise<void> {
  const sql = await getSql();
  await sql`DELETE FROM push_subscriptions WHERE endpoint = ${endpoint}`;
}

export async function markPushNotified(id: number, localDate: string): Promise<void> {
  const sql = await getSql();
  await sql`UPDATE push_subscriptions SET last_notified_date = ${localDate} WHERE id = ${id}`;
}

// Web Push endpoints are URLs the browser's push service hands out; the
// server POSTs to them (lib/push.ts). Accepting any https URL would let a
// caller point that POST at an arbitrary host (SSRF), so only the real push
// services are allowed:
//   Chrome / Edge-Chromium / Android / Opera / Brave / Samsung → fcm.googleapis.com
//   Firefox → updates.push.services.mozilla.com
//   Safari (macOS 13+, iOS/iPadOS 16.4+ home-screen apps) → web.push.apple.com (*.push.apple.com)
//   Legacy Edge / Windows (WNS) → *.notify.windows.com (e.g. wns2-*.notify.windows.com)
const PUSH_HOSTS_EXACT = new Set(["fcm.googleapis.com", "android.googleapis.com", "updates.push.services.mozilla.com"]);
const PUSH_HOST_SUFFIXES = [".push.apple.com", ".notify.windows.com"];
const MAX_ENDPOINT_LENGTH = 2048;
const MAX_KEY_LENGTH = 256;

/** True if `endpoint` is an https URL on a known Web Push service (default port, no credentials). */
export function isAllowedPushEndpoint(endpoint: string): boolean {
  if (endpoint.length > MAX_ENDPOINT_LENGTH) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username !== "" || url.password !== "") return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS_EXACT.has(host) || PUSH_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/** Validates the `subscription.toJSON()` shape a browser's PushManager hands back. */
export function parsePushKeys(value: unknown): PushKeys | null {
  const v = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  if (!v || typeof v.endpoint !== "string" || !isAllowedPushEndpoint(v.endpoint)) return null;
  if (typeof v.keys?.p256dh !== "string" || typeof v.keys?.auth !== "string") return null;
  if (v.keys.p256dh.length > MAX_KEY_LENGTH || v.keys.auth.length > MAX_KEY_LENGTH) return null;
  return { endpoint: v.endpoint, p256dh: v.keys.p256dh, auth: v.keys.auth };
}

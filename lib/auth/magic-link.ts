// PERS-04 magic links used to be a row in the same ephemeral SQLite file as
// sessions (see lib/auth/session-token.ts for the fuller explanation) — a
// magic link created by the instance that handled /api/auth/request was
// often invisible to whichever instance handled /api/auth/verify or
// /api/auth/verify-code next, so a correctly-typed, unexpired code could
// still come back "invalid, expired, or already used." Both the link token
// and the 6-digit code are now self-verifying: nothing about validating
// either one touches a database.
//
// Trade-off: without a server-side "used" flag, a token or code stays
// replayable for the rest of its TTL window instead of being burned on
// first use. Given the short (15 min) window and that this already wasn't
// reliably enforced across instances, that's an acceptable cost for
// actually working.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const TTL_MS = 15 * 60 * 1000; // 15 minutes — short-lived

// Falls back to a per-process random secret if SESSION_SECRET isn't set —
// see lib/auth/session-token.ts. Same secret, different HMAC "purpose"
// prefixes below, so a session token and a magic-link token/code can never
// be replayed as one another.
const SECRET = process.env.SESSION_SECRET ?? randomBytes(32).toString("hex");

function hmac(purpose: string, payload: string): string {
  return createHmac("sha256", SECRET).update(`${purpose}.${payload}`).digest("base64url");
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

// --- Link token (clicked from the sign-in email) --------------------------

export function createMagicLinkToken(email: string): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + TTL_MS;
  const payload = `${Buffer.from(email, "utf8").toString("base64url")}.${expiresAt}`;
  return { token: `${payload}.${hmac("ml-token", payload)}`, expiresAt };
}

export function consumeMagicLinkToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [emailB64, expiresAtStr, signature] = parts;

  if (!timingSafeStringEqual(signature, hmac("ml-token", `${emailB64}.${expiresAtStr}`))) return null;

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;

  try {
    return Buffer.from(emailB64, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

// --- 6-digit code (typed into a saved-to-home-screen app) -----------------
//
// A 6-digit code has no room to carry its own expiry, so instead of an
// exact timestamp this derives from a rolling TTL-sized time bucket (the
// same trick TOTP apps use) and accepts the current or previous bucket —
// tolerates the window boundary without ever needing to remember which
// bucket a given code was issued in.

function codeForBucket(email: string, bucket: number): string {
  const digest = hmac("ml-code", `${email.toLowerCase()}.${bucket}`);
  const n = Buffer.from(digest, "base64url").readUInt32BE(0) % 1_000_000;
  return String(n).padStart(6, "0");
}

export function currentMagicLinkCode(email: string): string {
  return codeForBucket(email, Math.floor(Date.now() / TTL_MS));
}

export function verifyMagicLinkCode(email: string, code: string): boolean {
  const bucket = Math.floor(Date.now() / TTL_MS);
  return timingSafeStringEqual(code, codeForBucket(email, bucket)) || timingSafeStringEqual(code, codeForBucket(email, bucket - 1));
}

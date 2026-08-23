// PERS-04 sessions used to be a row in the same SQLite file as everything
// else in lib/db/sqlite.ts — which, per that file's own doc comment, does
// not survive or share state across Vercel serverless instances. In
// practice that meant a session created by the instance that handled
// /api/auth/verify was often invisible to the next request, which could
// land on a different instance: sign-in looked like it worked, then
// silently failed. A signed, stateless token sidesteps this — the cookie
// itself carries {userId, email, expiresAt} plus an HMAC, so verifying it
// needs no database at all, on any instance.
//
// The tradeoff: without a server-side session row, there's no way to
// revoke a single token early (e.g. "sign out this device remotely") —
// logout just clears the cookie client-side, and a stolen token stays
// valid until it expires. Acceptable for this app; worth knowing if that
// ever changes.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// SESSION_SECRET should be set in the Vercel project's environment
// variables so every instance (and every future deploy) verifies with the
// same key. Without it, this falls back to a random per-process secret —
// safe (never forgeable from outside), but it means tokens still won't
// verify across instances until the real secret is configured.
const SECRET = process.env.SESSION_SECRET ?? randomBytes(32).toString("hex");

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("base64url");
}

export function createSessionToken(userId: number, email: string, expiresAt: Date): string {
  const payload = `${userId}.${Buffer.from(email, "utf8").toString("base64url")}.${expiresAt.getTime()}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string): { userId: number; email: string } | null {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [userIdStr, emailB64, expiresAtStr, signature] = parts;

  const expected = sign(`${userIdStr}.${emailB64}.${expiresAtStr}`);
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

  const expiresAt = Number(expiresAtStr);
  const userId = Number(userIdStr);
  if (!Number.isFinite(expiresAt) || !Number.isFinite(userId) || Date.now() > expiresAt) return null;

  try {
    return { userId, email: Buffer.from(emailB64, "base64url").toString("utf8") };
  } catch {
    return null;
  }
}

// PERS-04 sign-in has two halves, emailed together:
//
// - A link token, clicked from the email. Self-verifying (HMAC over
//   {email, expiresAt}), so it needs no database. It's 256 bits of MAC, so
//   guessing isn't a concern; it stays valid for its 15-minute TTL rather
//   than being burned on first use, which also keeps mail scanners that
//   pre-fetch links (Outlook Safe Links etc.) from consuming it first.
//
// - A 6-digit code, typed into a saved-to-home-screen app. Six digits is
//   only a million possibilities, so the code is NOT self-verifying: it's
//   random, stored hashed in Postgres (lib/db/auth-codes.ts), single-use,
//   expires after 15 minutes, and is burned after 5 wrong guesses.
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { getAuthSecret } from "./secret";
import { normalizeEmail } from "./email";

export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000; // 15 minutes — short-lived

// Same secret as session tokens, different HMAC "purpose" prefixes, so a
// session token, a magic-link token and a code hash can never be replayed
// as one another.
function hmac(purpose: string, payload: string): string {
  return createHmac("sha256", getAuthSecret()).update(`${purpose}.${payload}`).digest("base64url");
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

// --- Link token (clicked from the sign-in email) --------------------------

export function createMagicLinkToken(email: string): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + MAGIC_LINK_TTL_MS;
  const payload = `${Buffer.from(normalizeEmail(email), "utf8").toString("base64url")}.${expiresAt}`;
  return { token: `${payload}.${hmac("ml-token", payload)}`, expiresAt };
}

/** The (normalized) email a valid, unexpired link token was issued for, else null. */
export function consumeMagicLinkToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [emailB64, expiresAtStr, signature] = parts;

  if (!timingSafeStringEqual(signature, hmac("ml-token", `${emailB64}.${expiresAtStr}`))) return null;

  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;

  try {
    return normalizeEmail(Buffer.from(emailB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

// --- 6-digit code (typed into a saved-to-home-screen app) -----------------

export function generateSignInCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Keyed hash stored instead of the code itself, so a database leak doesn't hand out live codes. */
export function hashSignInCode(email: string, code: string): string {
  return hmac("ml-code", `${normalizeEmail(email)}.${code}`);
}

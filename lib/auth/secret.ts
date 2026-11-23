import { randomBytes } from "node:crypto";

// The one HMAC key behind session tokens, magic-link tokens and stored
// sign-in code hashes. In production it must come from SESSION_SECRET: a
// silent per-process random fallback there would make every token verify
// only on the instance that minted it (and make misconfiguration invisible).
// Read lazily — never at module load — so `next build`, which imports route
// modules with NODE_ENV=production, doesn't need the secret.
let devFallback: string | null = null;

export class MissingSecretError extends Error {
  constructor() {
    super("SESSION_SECRET is not set — refusing to sign or verify auth tokens in production");
    this.name = "MissingSecretError";
  }
}

/** Throws MissingSecretError in production when SESSION_SECRET is unset or empty. */
export function getAuthSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") throw new MissingSecretError();
  // Local dev only: random per process, so tokens die on restart. Never forgeable.
  devFallback ??= randomBytes(32).toString("hex");
  return devFallback;
}

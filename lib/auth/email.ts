const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Canonical form of an email for storage and lookup: trimmed, lowercased. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** The normalized email if `value` is a plausible address, else null. */
export function parseEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = normalizeEmail(value);
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}

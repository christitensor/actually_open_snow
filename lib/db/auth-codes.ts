// Server-side state for the 6-digit sign-in code (see lib/auth/magic-link.ts
// for why the code, unlike the link, can't be stateless). One row per email:
// requesting a new code replaces the old one. Every check is a single atomic
// UPDATE, so concurrent guesses landing on different serverless instances
// still can't exceed the attempt limit or consume one code twice.
import { getSql } from "./postgres";
import { hashSignInCode, MAGIC_LINK_TTL_MS } from "@/lib/auth/magic-link";

export const MAX_CODE_ATTEMPTS = 5;

export async function storeSignInCode(email: string, code: string): Promise<void> {
  const sql = await getSql();
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS).toISOString();
  await sql`
    INSERT INTO auth_codes (email, code_hash, expires_at, attempts, consumed_at, created_at)
    VALUES (${email}, ${hashSignInCode(email, code)}, ${expiresAt}, 0, NULL, now())
    ON CONFLICT (email) DO UPDATE SET
      code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at,
      attempts = 0, consumed_at = NULL, created_at = EXCLUDED.created_at
  `;
}

/**
 * Checks a guess and, if right, burns the code — all in one statement. Each
 * call counts as an attempt; once MAX_CODE_ATTEMPTS have been used (right or
 * wrong), or the code expired or was used, nothing matches the WHERE clause
 * and every further guess fails until a new code is requested.
 */
export async function consumeSignInCode(email: string, code: string): Promise<boolean> {
  const sql = await getSql();
  const rows = (await sql`
    UPDATE auth_codes SET
      attempts = attempts + 1,
      consumed_at = CASE WHEN code_hash = ${hashSignInCode(email, code)} THEN now() ELSE NULL END
    WHERE email = ${email}
      AND consumed_at IS NULL
      AND expires_at > now()
      AND attempts < ${MAX_CODE_ATTEMPTS}
    RETURNING consumed_at IS NOT NULL AS ok
  `) as { ok: boolean }[];
  return rows[0]?.ok === true;
}

// PERS-04 users + favorites need a store that survives across Vercel's
// separate serverless instances — the old lib/db/sqlite.ts's own doc comment
// already flagged this as the eventual requirement, and it's what turned
// "signed in, starred a resort" into "the star is gone on reload." Neon's
// HTTP-based serverless driver (no long-lived TCP connection to pool) is
// the natural fit for a Postgres database called from short-lived
// serverless function invocations.
//
// Any other Postgres (self-hosted, Supabase, RDS, a local dev database)
// goes through the standard `postgres` driver over TCP instead. Both expose
// the same tagged-template call, so the rest of the app doesn't care which.
import { neon } from "@neondatabase/serverless";
import postgres from "postgres";

const CONNECTION_STRING = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

export const isPostgresConfigured = Boolean(CONNECTION_STRING);

/** Tagged-template query → rows. Implemented by both drivers. */
export type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;

let sqlClient: Sql | null = null;
let schemaReady: Promise<void> | null = null;

function isNeon(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(".neon.tech");
  } catch {
    return false;
  }
}

function client(): Sql {
  if (!CONNECTION_STRING) {
    throw new Error("DATABASE_URL (or POSTGRES_URL) is not set — isPostgresConfigured should be checked first");
  }
  if (!sqlClient) {
    sqlClient = isNeon(CONNECTION_STRING)
      ? (neon(CONNECTION_STRING) as unknown as Sql)
      : (postgres(CONNECTION_STRING, { max: 5, idle_timeout: 20, onnotice: () => {} }) as unknown as Sql);
  }
  return sqlClient;
}

async function ensureSchema(sql: Sql): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS favorites (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      favorite_key TEXT NOT NULL,
      location_json TEXT NOT NULL,
      saved_at TIMESTAMPTZ NOT NULL,
      UNIQUE(user_id, favorite_key)
    )
  `;
  // PERS-07: user-chosen order (drag-to-reorder). NULL = never reordered,
  // which sorts after ordered rows by saved_at — so a newly saved favorite
  // lands at the bottom without needing a sort_order of its own.
  await sql`ALTER TABLE favorites ADD COLUMN IF NOT EXISTS sort_order INTEGER`;
  // PERS-04 v2: server-side sessions (one per signed-in browser/app), so
  // sign-in can roll forward while you use it and be revoked per device.
  // The cookie holds an HMAC-signed session id (lib/auth/sessions.ts).
  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      last_seen_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      user_agent TEXT,
      revoked_at TIMESTAMPTZ
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id)`;
  // PERS-04 v2: WebAuthn passkeys. id = credential id (base64url).
  await sql`
    CREATE TABLE IF NOT EXISTS passkeys (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      public_key TEXT NOT NULL,
      counter BIGINT NOT NULL DEFAULT 0,
      transports TEXT,
      device_type TEXT,
      backed_up BOOLEAN,
      name TEXT,
      created_at TIMESTAMPTZ NOT NULL,
      last_used_at TIMESTAMPTZ
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS passkeys_user_idx ON passkeys (user_id)`;
  // PERS-08: per-account view settings (lib/preferences/), one JSON document per user.
  await sql`
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id INTEGER PRIMARY KEY,
      prefs TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    )
  `;
  // PERS-06: one row per (device push endpoint, location) — see lib/db/push-subscriptions.ts.
  await sql`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      endpoint TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      location_name TEXT NOT NULL,
      lat DOUBLE PRECISION NOT NULL,
      lon DOUBLE PRECISION NOT NULL,
      threshold_in DOUBLE PRECISION NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      last_notified_date TEXT,
      UNIQUE(endpoint, location_name)
    )
  `;
  // Emails are now stored lowercased (lib/auth/email.ts), but rows created
  // before that may be mixed-case; lookups go through lower(email), so index it.
  // Not UNIQUE: pre-existing case-variant duplicates would make that fail.
  await sql`CREATE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email))`;
  // 6-digit sign-in codes: hashed, single-use, expiring, attempt-limited — see lib/db/auth-codes.ts.
  await sql`
    CREATE TABLE IF NOT EXISTS auth_codes (
      email TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      consumed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL
    )
  `;
  // Per-IP / per-email throttles for the sign-in endpoints — see lib/db/rate-limit.ts.
  await sql`
    CREATE TABLE IF NOT EXISTS auth_rate_limits (
      key TEXT NOT NULL,
      window_start TIMESTAMPTZ NOT NULL,
      count INTEGER NOT NULL,
      PRIMARY KEY (key, window_start)
    )
  `;
}

/** Resolves to a ready-to-query client; table creation only actually runs once per warm instance. */
export async function getSql(): Promise<Sql> {
  const sql = client();
  if (!schemaReady) schemaReady = ensureSchema(sql);
  await schemaReady;
  return sql;
}

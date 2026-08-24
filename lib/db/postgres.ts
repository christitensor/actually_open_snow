// PERS-04 users + favorites need a store that survives across Vercel's
// separate serverless instances — lib/db/sqlite.ts's own doc comment
// already flagged this as the eventual requirement, and it's what turned
// "signed in, starred a resort" into "the star is gone on reload." Neon's
// HTTP-based serverless driver (no long-lived TCP connection to pool) is
// the natural fit for a Postgres database called from short-lived
// serverless function invocations.
import { neon } from "@neondatabase/serverless";

const CONNECTION_STRING = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

export const isPostgresConfigured = Boolean(CONNECTION_STRING);

export type Sql = ReturnType<typeof neon>;

let sqlClient: Sql | null = null;
let schemaReady: Promise<void> | null = null;

function client(): Sql {
  if (!CONNECTION_STRING) {
    throw new Error("DATABASE_URL (or POSTGRES_URL) is not set — isPostgresConfigured should be checked first");
  }
  if (!sqlClient) sqlClient = neon(CONNECTION_STRING);
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
}

/** Resolves to a ready-to-query client; table creation only actually runs once per warm instance. */
export async function getSql(): Promise<Sql> {
  const sql = client();
  if (!schemaReady) schemaReady = ensureSchema(sql);
  await schemaReady;
  return sql;
}

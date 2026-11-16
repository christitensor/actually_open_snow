// Fixed-window counters in Postgres (table auth_rate), so limits hold
// across Vercel's serverless instances. Used for email codes: a 6-digit
// code has only a million values, so guesses must be capped, and sends are
// capped so the form can't be used to flood someone's inbox.
import { getSql } from "@/lib/db/postgres";

const WINDOW_MS = 15 * 60 * 1000;

/** Increments `key` in the current window and reports whether it's still within `limit`. */
export async function hit(key: string, limit: number): Promise<{ ok: boolean; count: number }> {
  const sql = await getSql();
  const bucket = Math.floor(Date.now() / WINDOW_MS);
  const rows = (await sql`
    INSERT INTO auth_rate (key, bucket, count) VALUES (${key}, ${bucket}, 1)
    ON CONFLICT (key, bucket) DO UPDATE SET count = auth_rate.count + 1
    RETURNING count
  `) as { count: number }[];
  // Opportunistic cleanup of old windows.
  if (Math.random() < 0.02) await sql`DELETE FROM auth_rate WHERE bucket < ${bucket - 4}`;
  const count = rows[0]?.count ?? 1;
  return { ok: count <= limit, count };
}

/** Current count for `key` in this window or the previous one (codes stay valid across one boundary). */
export async function peek(key: string): Promise<number> {
  const sql = await getSql();
  const bucket = Math.floor(Date.now() / WINDOW_MS);
  const rows = (await sql`SELECT COALESCE(SUM(count), 0)::int AS n FROM auth_rate WHERE key = ${key} AND bucket >= ${bucket - 1}`) as { n: number }[];
  return rows[0]?.n ?? 0;
}

/** Per-window counts for `key` in this window and the previous one. */
export async function counts(key: string): Promise<{ bucket: number; count: number }[]> {
  const sql = await getSql();
  const bucket = Math.floor(Date.now() / WINDOW_MS);
  const rows = (await sql`SELECT bucket, count FROM auth_rate WHERE key = ${key} AND bucket >= ${bucket - 1}`) as { bucket: string | number; count: number }[];
  return rows.map((r) => ({ bucket: Number(r.bucket), count: r.count }));
}

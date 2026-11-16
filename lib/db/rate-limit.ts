// Fixed-window request counters in Postgres. In-memory counters don't work
// on Vercel — each serverless instance would keep its own — so the count
// lives in the shared database and is bumped with one atomic upsert.
import { getSql } from "./postgres";

/**
 * Records one hit against `key` and reports whether it's still within
 * `limit` hits per `windowSeconds`. Rows from long-past windows are pruned
 * opportunistically (about 1 call in 50) so the table stays small without a
 * separate cleanup job.
 */
export async function hitRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const sql = await getSql();
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs).toISOString();
  const rows = (await sql`
    INSERT INTO auth_rate_limits (key, window_start, count) VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT (key, window_start) DO UPDATE SET count = auth_rate_limits.count + 1
    RETURNING count
  `) as { count: number }[];
  if (Math.random() < 0.02) {
    await sql`DELETE FROM auth_rate_limits WHERE window_start < now() - interval '1 day'`;
  }
  return rows[0].count <= limit;
}

import { getSql } from "./postgres";
import { DEFAULT_PREFERENCES, merge, sanitize, type Preferences } from "@/lib/preferences/schema";

/** The account's saved settings, or null if it has never saved any. */
export async function getPreferences(userId: number): Promise<Preferences | null> {
  const sql = await getSql();
  const rows = (await sql`SELECT prefs FROM user_preferences WHERE user_id = ${userId}`) as { prefs: string }[];
  if (!rows[0]) return null;
  try {
    return sanitize(JSON.parse(rows[0].prefs));
  } catch {
    return null;
  }
}

/** Replaces the saved settings wholesale (used by "Reset to defaults"). */
export async function replacePreferences(userId: number, prefs: unknown): Promise<Preferences> {
  const sql = await getSql();
  const next = sanitize(prefs);
  await sql`
    INSERT INTO user_preferences (user_id, prefs, updated_at) VALUES (${userId}, ${JSON.stringify(next)}, now())
    ON CONFLICT (user_id) DO UPDATE SET prefs = EXCLUDED.prefs, updated_at = now()
  `;
  return next;
}

/** Merges a partial update into the saved settings and returns the result. */
export async function updatePreferences(userId: number, patch: Partial<Preferences>): Promise<Preferences> {
  const sql = await getSql();
  const current = (await getPreferences(userId)) ?? DEFAULT_PREFERENCES;
  const next = merge(current, patch);
  await sql`
    INSERT INTO user_preferences (user_id, prefs, updated_at) VALUES (${userId}, ${JSON.stringify(next)}, now())
    ON CONFLICT (user_id) DO UPDATE SET prefs = EXCLUDED.prefs, updated_at = now()
  `;
  return next;
}

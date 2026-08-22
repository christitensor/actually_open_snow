// PERS-04: magic-link accounts, so favorites sync across devices instead
// of being stuck in one browser's localStorage (lib/favorites.ts). No
// passwords — a user proves they own an email by clicking a one-time link,
// same trust model as the PERS-03 alert-unsubscribe links, just used to
// start a session instead of removing a subscription.
import { randomUUID } from "node:crypto";
import { getDb } from "./sqlite";
import { favoriteKey } from "@/lib/util/favorite-key";
import type { FavoriteLocation, Location } from "@/lib/models/types";

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000; // 15 minutes — short-lived, single use
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface User {
  id: number;
  email: string;
}

interface UserRow {
  id: number;
  email: string;
}

// --- Magic links ---------------------------------------------------------

function generateCode(): string {
  // 6-digit numeric, zero-padded — short enough to type by hand from an
  // email into a saved-to-home-screen app (see consumeMagicLinkByCode).
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
}

export function createMagicLink(email: string): { token: string; code: string; expiresAt: string } {
  const token = randomUUID();
  const code = generateCode();
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS).toISOString();
  getDb()
    .prepare(`INSERT INTO magic_links (email, token, code, expires_at, used_at) VALUES (?, ?, ?, ?, NULL)`)
    .run(email, token, code, expiresAt);
  return { token, code, expiresAt };
}

/** Validates + burns a magic-link token, returning the email it was issued to (or null if invalid/expired/already used). */
export function consumeMagicLink(token: string): string | null {
  const db = getDb();
  const row = db.prepare(`SELECT email, expires_at, used_at FROM magic_links WHERE token = ?`).get(token) as
    | { email: string; expires_at: string; used_at: string | null }
    | undefined;
  if (!row || row.used_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;

  db.prepare(`UPDATE magic_links SET used_at = ? WHERE token = ?`).run(new Date().toISOString(), token);
  return row.email;
}

// iOS treats a "saved to home screen" web app as a separate storage silo
// from Safari — a magic link opened from Mail always opens in Safari, so
// it can never set a cookie the saved app can see. This lets someone who
// already has the saved app open finish sign-in entirely within it: type
// the short code from the email instead of tapping the link, so the
// session cookie gets set in the right context to begin with. Rate-limited
// naturally by the same 15-minute expiry + single-use burn as the token —
// a brute-force guesser gets one attempt window per requested code.
export function consumeMagicLinkByCode(email: string, code: string): boolean {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, token, expires_at, used_at FROM magic_links WHERE email = ? AND code = ? ORDER BY id DESC LIMIT 1`
    )
    .get(email, code) as { id: number; token: string; expires_at: string; used_at: string | null } | undefined;
  if (!row || row.used_at) return false;
  if (new Date(row.expires_at).getTime() < Date.now()) return false;

  db.prepare(`UPDATE magic_links SET used_at = ? WHERE id = ?`).run(new Date().toISOString(), row.id);
  return true;
}

// --- Users -----------------------------------------------------------------

export function getOrCreateUser(email: string): User {
  const db = getDb();
  const existing = db.prepare(`SELECT id, email FROM users WHERE email = ?`).get(email) as UserRow | undefined;
  if (existing) return existing;

  const result = db
    .prepare(`INSERT INTO users (email, created_at) VALUES (?, ?)`)
    .run(email, new Date().toISOString());
  return { id: Number(result.lastInsertRowid), email };
}

// --- Sessions ----------------------------------------------------------

export function createSession(userId: number): { token: string; expiresAt: Date } {
  const token = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  getDb()
    .prepare(`INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`)
    .run(token, userId, now.toISOString(), expiresAt.toISOString());
  return { token, expiresAt };
}

export function getUserBySessionToken(token: string): User | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT users.id as id, users.email as email, sessions.expires_at as expires_at
       FROM sessions JOIN users ON users.id = sessions.user_id
       WHERE sessions.token = ?`
    )
    .get(token) as (UserRow & { expires_at: string }) | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
    return null;
  }
  return { id: row.id, email: row.email };
}

export function deleteSession(token: string): void {
  getDb().prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
}

// --- Favorites -----------------------------------------------------------

interface FavoriteRow {
  location_json: string;
}

function rowToFavorite(row: FavoriteRow): FavoriteLocation {
  return JSON.parse(row.location_json) as FavoriteLocation;
}

export function listFavoritesForUser(userId: number): FavoriteLocation[] {
  const rows = getDb()
    .prepare(`SELECT location_json FROM favorites WHERE user_id = ? ORDER BY saved_at ASC`)
    .all(userId) as unknown as FavoriteRow[];
  return rows.map(rowToFavorite);
}

/** Toggles one location on/off for a user's server-side favorites, returning the updated list. */
export function toggleFavoriteForUser(userId: number, location: Location): FavoriteLocation[] {
  const db = getDb();
  const key = favoriteKey(location);
  const existing = db.prepare(`SELECT id FROM favorites WHERE user_id = ? AND favorite_key = ?`).get(userId, key) as
    | { id: number }
    | undefined;

  if (existing) {
    db.prepare(`DELETE FROM favorites WHERE id = ?`).run(existing.id);
  } else {
    const favorite: FavoriteLocation = { ...location, savedAt: new Date().toISOString() };
    db.prepare(
      `INSERT INTO favorites (user_id, favorite_key, location_json, saved_at) VALUES (?, ?, ?, ?)`
    ).run(userId, key, JSON.stringify(favorite), favorite.savedAt);
  }
  return listFavoritesForUser(userId);
}

/** One-time merge of a freshly-signed-in user's local (pre-account) favorites into their server-side set. Idempotent — already-present keys are left alone. */
export function importFavoritesForUser(userId: number, favorites: FavoriteLocation[]): FavoriteLocation[] {
  const db = getDb();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO favorites (user_id, favorite_key, location_json, saved_at) VALUES (?, ?, ?, ?)`
  );
  for (const favorite of favorites) {
    insert.run(userId, favoriteKey(favorite), JSON.stringify(favorite), favorite.savedAt);
  }
  return listFavoritesForUser(userId);
}

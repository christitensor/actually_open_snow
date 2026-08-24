// PERS-04: magic-link accounts, so favorites sync across devices instead
// of being stuck in one browser's localStorage (lib/favorites.ts). No
// passwords — a user proves they own an email by clicking a one-time link,
// same trust model as the PERS-03 alert-unsubscribe links, just used to
// start a session instead of removing a subscription. Magic links
// themselves are stateless (lib/auth/magic-link.ts) — see that file for why.
import { getSql } from "./postgres";
import { createSessionToken, verifySessionToken } from "@/lib/auth/session-token";
import { favoriteKey } from "@/lib/util/favorite-key";
import type { FavoriteLocation, Location } from "@/lib/models/types";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface User {
  id: number;
  email: string;
}

interface UserRow {
  id: number;
  email: string;
}

// --- Users -----------------------------------------------------------------
//
// Backed by Postgres (lib/db/postgres.ts) — that's what makes an account's
// favorites actually durable across Vercel's separate serverless instances,
// unlike the ephemeral per-instance SQLite this used before.

export async function getOrCreateUser(email: string): Promise<User> {
  const sql = await getSql();
  const existing = (await sql`SELECT id, email FROM users WHERE email = ${email}`) as UserRow[];
  if (existing[0]) return existing[0];

  const inserted = (await sql`
    INSERT INTO users (email, created_at) VALUES (${email}, ${new Date().toISOString()})
    ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
    RETURNING id, email
  `) as UserRow[];
  return inserted[0];
}

// --- Sessions ----------------------------------------------------------

// Stateless: the token itself carries {userId, email, expiresAt} plus an
// HMAC (lib/auth/session-token.ts), so validating it needs no database
// lookup — see that file's comment for why (ephemeral SQLite on Vercel).
export function createSession(userId: number, email: string): { token: string; expiresAt: Date } {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  return { token: createSessionToken(userId, email, expiresAt), expiresAt };
}

export function getUserBySessionToken(token: string): User | null {
  const verified = verifySessionToken(token);
  return verified ? { id: verified.userId, email: verified.email } : null;
}

// --- Favorites -----------------------------------------------------------

interface FavoriteRow {
  location_json: string;
}

function rowToFavorite(row: FavoriteRow): FavoriteLocation {
  return JSON.parse(row.location_json) as FavoriteLocation;
}

export async function listFavoritesForUser(userId: number): Promise<FavoriteLocation[]> {
  const sql = await getSql();
  const rows = (await sql`
    SELECT location_json FROM favorites WHERE user_id = ${userId} ORDER BY saved_at ASC
  `) as FavoriteRow[];
  return rows.map(rowToFavorite);
}

/** Toggles one location on/off for a user's server-side favorites, returning the updated list. */
export async function toggleFavoriteForUser(userId: number, location: Location): Promise<FavoriteLocation[]> {
  const key = favoriteKey(location);
  const sql = await getSql();
  const existing = (await sql`
    SELECT id FROM favorites WHERE user_id = ${userId} AND favorite_key = ${key}
  `) as { id: number }[];

  if (existing[0]) {
    await sql`DELETE FROM favorites WHERE id = ${existing[0].id}`;
  } else {
    const favorite: FavoriteLocation = { ...location, savedAt: new Date().toISOString() };
    await sql`
      INSERT INTO favorites (user_id, favorite_key, location_json, saved_at)
      VALUES (${userId}, ${key}, ${JSON.stringify(favorite)}, ${favorite.savedAt})
    `;
  }
  return listFavoritesForUser(userId);
}

/** One-time merge of a freshly-signed-in user's local (pre-account) favorites into their server-side set. Idempotent — already-present keys are left alone. */
export async function importFavoritesForUser(userId: number, favorites: FavoriteLocation[]): Promise<FavoriteLocation[]> {
  const sql = await getSql();
  for (const favorite of favorites) {
    await sql`
      INSERT INTO favorites (user_id, favorite_key, location_json, saved_at)
      VALUES (${userId}, ${favoriteKey(favorite)}, ${JSON.stringify(favorite)}, ${favorite.savedAt})
      ON CONFLICT (user_id, favorite_key) DO NOTHING
    `;
  }
  return listFavoritesForUser(userId);
}

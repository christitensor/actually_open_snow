// PERS-03 alert-subscription storage. Uses Node's built-in `node:sqlite`
// (stable enough for this, still flagged experimental by Node itself as
// of this build's Node version) rather than adding a dependency — this
// keeps the "personalized backend" dependency-free for local dev, exactly
// matching ARCHITECTURE.md's original plan ("SQLite is fine for local
// dev, Postgres for anything deployed"). Swap this module for a Postgres
// client before a real multi-instance production deploy: SQLite here is a
// single file, which does not survive or share state across serverless
// instances — on Vercel specifically, each function instance gets its own
// ephemeral copy that resets on cold start/redeploy, so subscriptions
// aren't durable there. Using os.tmpdir() (not process.cwd()) is what
// makes this not crash on Vercel at all: the deployment bundle itself is
// read-only at runtime, so writing next to it throws EROFS the moment
// this route is hit.
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { AlertSubscription } from "@/lib/models/types";

const DB_PATH = join(tmpdir(), "actually-open-snow", "app.db");

let db: DatabaseSync | null = null;

// users/favorites moved to Postgres (lib/db/postgres.ts) — see that file's
// comment for why. This file's ephemeral-storage caveat still applies to
// alert_subscriptions below; PERS-03 alerts haven't hit the same reported
// failure yet, so migrating them is a separate, not-yet-scoped follow-up.
export function getDb(): DatabaseSync {
  if (db) return db;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS alert_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      location_name TEXT NOT NULL,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      threshold_in REAL NOT NULL,
      unsubscribe_token TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      last_notified_date TEXT
    )
  `);
  return db;
}

interface Row {
  id: number;
  email: string;
  location_name: string;
  lat: number;
  lon: number;
  threshold_in: number;
  unsubscribe_token: string;
  created_at: string;
  last_notified_date: string | null;
}

function rowToSubscription(row: Row): AlertSubscription {
  return {
    id: row.id,
    email: row.email,
    locationName: row.location_name,
    lat: row.lat,
    lon: row.lon,
    thresholdIn: row.threshold_in,
    unsubscribeToken: row.unsubscribe_token,
    createdAt: row.created_at,
    lastNotifiedDate: row.last_notified_date,
  };
}

export interface CreateSubscriptionInput {
  email: string;
  locationName: string;
  lat: number;
  lon: number;
  thresholdIn: number;
}

export function createSubscription(input: CreateSubscriptionInput): AlertSubscription {
  const database = getDb();

  // Avoid accidental duplicate rows on a repeated form submit for the same email+location.
  const existing = database
    .prepare(
      `SELECT * FROM alert_subscriptions WHERE email = ? AND ABS(lat - ?) < 0.0001 AND ABS(lon - ?) < 0.0001`
    )
    .get(input.email, input.lat, input.lon) as Row | undefined;
  if (existing) {
    database
      .prepare(`UPDATE alert_subscriptions SET threshold_in = ? WHERE id = ?`)
      .run(input.thresholdIn, existing.id);
    return rowToSubscription({ ...existing, threshold_in: input.thresholdIn });
  }

  const token = randomUUID();
  const createdAt = new Date().toISOString();
  const result = database
    .prepare(
      `INSERT INTO alert_subscriptions (email, location_name, lat, lon, threshold_in, unsubscribe_token, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(input.email, input.locationName, input.lat, input.lon, input.thresholdIn, token, createdAt);

  return {
    id: Number(result.lastInsertRowid),
    email: input.email,
    locationName: input.locationName,
    lat: input.lat,
    lon: input.lon,
    thresholdIn: input.thresholdIn,
    unsubscribeToken: token,
    createdAt,
    lastNotifiedDate: null,
  };
}

export function listSubscriptions(): AlertSubscription[] {
  const rows = getDb().prepare(`SELECT * FROM alert_subscriptions`).all() as unknown as Row[];
  return rows.map(rowToSubscription);
}

export function deleteSubscriptionByToken(token: string): boolean {
  const result = getDb().prepare(`DELETE FROM alert_subscriptions WHERE unsubscribe_token = ?`).run(token);
  return result.changes > 0;
}

export function markNotifiedToday(id: number, dateStr: string): void {
  getDb().prepare(`UPDATE alert_subscriptions SET last_notified_date = ? WHERE id = ?`).run(dateStr, id);
}

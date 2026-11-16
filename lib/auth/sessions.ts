// PERS-04 v2: server-side sessions.
//
// The cookie holds `<sessionId>.<hmac>`; the session row lives in Postgres.
// Compared with the previous stateless 30-day token:
// - Rolling: while you keep using the app the session keeps extending
//   (SESSION_TTL_DAYS from last use), so you stay signed in on every
//   device you actually use instead of being dropped after a fixed 30 days.
// - Revocable: each signed-in browser/app is a row, so the account page
//   can list devices and sign one (or all others) out.
// - The HMAC means a guessed or tampered id is rejected before any DB
//   lookup.
//
// Old stateless tokens (lib/auth/session-token.ts) are accepted once and
// upgraded to a session row, so nobody signed in today gets dropped.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { getSql } from "@/lib/db/postgres";
import { verifySessionToken } from "@/lib/auth/session-token";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/auth/cookie";

const SESSION_TTL_DAYS = 180;
const TTL_MS = SESSION_TTL_DAYS * 86_400_000;
// Only write last_seen/expiry (and re-send the cookie) once a day, not on every request.
const TOUCH_INTERVAL_MS = 86_400_000;

const SECRET = process.env.SESSION_SECRET ?? randomBytes(32).toString("hex");

export interface SessionUser {
  id: number;
  email: string;
  sessionId: string;
}

function sign(id: string): string {
  return createHmac("sha256", SECRET).update(`session.${id}`).digest("base64url");
}

function tokenFor(id: string): string {
  return `${id}.${sign(id)}`;
}

function parse(token: string): string | null {
  const [id, sig, ...rest] = token.split(".");
  if (!id || !sig || rest.length) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(id));
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

/** Short, human description of a browser/device from its User-Agent, for the account page. */
export function describeUserAgent(ua: string | null | undefined): string {
  if (!ua) return "Unknown device";
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Mac OS X/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : /CrOS/.test(ua)
              ? "Chromebook"
              : /Linux/.test(ua)
                ? "Linux"
                : "Unknown OS";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /CriOS|Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : /Mobile\//.test(ua) && /AppleWebKit/.test(ua)
            ? "Home-screen app"
            : "Browser";
  return `${browser} on ${os}`;
}

export async function createSession(userId: number, userAgent: string | null): Promise<{ token: string; expiresAt: Date }> {
  const sql = await getSql();
  const id = randomBytes(24).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TTL_MS);
  await sql`
    INSERT INTO sessions (id, user_id, created_at, last_seen_at, expires_at, user_agent)
    VALUES (${id}, ${userId}, ${now.toISOString()}, ${now.toISOString()}, ${expiresAt.toISOString()}, ${userAgent?.slice(0, 400) ?? null})
  `;
  return { token: tokenFor(id), expiresAt };
}

export function setSessionCookie(res: NextResponse, token: string, expiresAt: Date) {
  res.cookies.set(SESSION_COOKIE, token, { ...SESSION_COOKIE_OPTIONS, expires: expiresAt });
}

interface SessionRow {
  id: string;
  user_id: number;
  email: string;
  last_seen_at: string;
}

/**
 * Resolves a session cookie value to its user. `refresh` is set when the
 * session was extended (or a legacy token upgraded) and the caller should
 * re-send the cookie with the new token/expiry.
 */
export async function resolveSession(
  token: string,
  userAgent: string | null
): Promise<{ user: SessionUser; refresh?: { token: string; expiresAt: Date } } | null> {
  const sql = await getSql();
  const id = parse(token);

  if (!id) {
    // Legacy stateless token from before server-side sessions: upgrade it.
    const legacy = verifySessionToken(token);
    if (!legacy) return null;
    const created = await createSession(legacy.userId, userAgent);
    const newId = parse(created.token)!;
    return { user: { id: legacy.userId, email: legacy.email, sessionId: newId }, refresh: created };
  }

  const rows = (await sql`
    SELECT s.id, s.user_id, u.email, s.last_seen_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id = ${id} AND s.revoked_at IS NULL AND s.expires_at > now()
  `) as SessionRow[];
  const row = rows[0];
  if (!row) return null;

  const user = { id: row.user_id, email: row.email, sessionId: row.id };
  if (Date.now() - new Date(row.last_seen_at).getTime() < TOUCH_INTERVAL_MS) return { user };

  const expiresAt = new Date(Date.now() + TTL_MS);
  await sql`
    UPDATE sessions SET last_seen_at = now(), expires_at = ${expiresAt.toISOString()},
      user_agent = COALESCE(${userAgent?.slice(0, 400) ?? null}, user_agent)
    WHERE id = ${id}
  `;
  return { user, refresh: { token, expiresAt } };
}

/** The signed-in user for the current request (route handlers / server components), without cookie refresh. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    return (await resolveSession(token, null))?.user ?? null;
  } catch {
    return null;
  }
}

export interface SessionSummary {
  id: string;
  device: string;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

export async function listSessions(userId: number, currentId: string): Promise<SessionSummary[]> {
  const sql = await getSql();
  const rows = (await sql`
    SELECT id, user_agent, created_at, last_seen_at FROM sessions
    WHERE user_id = ${userId} AND revoked_at IS NULL AND expires_at > now()
    ORDER BY last_seen_at DESC
  `) as { id: string; user_agent: string | null; created_at: string; last_seen_at: string }[];
  return rows.map((r) => ({
    id: r.id,
    device: describeUserAgent(r.user_agent),
    createdAt: new Date(r.created_at).toISOString(),
    lastSeenAt: new Date(r.last_seen_at).toISOString(),
    current: r.id === currentId,
  }));
}

export async function revokeSession(userId: number, sessionId: string): Promise<void> {
  const sql = await getSql();
  await sql`UPDATE sessions SET revoked_at = now() WHERE id = ${sessionId} AND user_id = ${userId}`;
}

export async function revokeOtherSessions(userId: number, keepId: string): Promise<number> {
  const sql = await getSql();
  const rows = (await sql`
    UPDATE sessions SET revoked_at = now()
    WHERE user_id = ${userId} AND id <> ${keepId} AND revoked_at IS NULL
    RETURNING id
  `) as { id: string }[];
  return rows.length;
}

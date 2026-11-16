// PERS-04 v2: passkeys (WebAuthn) via @simplewebauthn/server.
//
// Passkeys are the main sign-in method: Face ID / Touch ID / a device PIN,
// nothing to type, phishing-resistant, and synced across a person's devices
// by iCloud Keychain or Google Password Manager. That sync is what makes an
// account follow you to a new device. The whole ceremony happens inside the
// page, so it also works in an iOS home-screen app, where emailed links
// open Safari instead.
//
// The relying-party ID is the site's hostname. Passkeys are bound to it, so
// a passkey made on actuallyopensnow.vercel.app works only there (preview
// deployments get their own). Self-hosters behind a proxy can pin the
// origin(s) with AUTH_ORIGIN (comma-separated, e.g.
// "https://snow.example.com"); the first one sets the RP ID.
//
// Challenges are kept in a short-lived, HMAC-signed, httpOnly cookie, not
// a table: one per ceremony, nothing to clean up.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { getSql } from "@/lib/db/postgres";

export const RP_NAME = "Actually Open Snow";
const CHALLENGE_COOKIE = "aos_webauthn";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const SECRET = process.env.SESSION_SECRET ?? randomBytes(32).toString("hex");

// --- Relying party -----------------------------------------------------------

export function relyingParty(req: NextRequest): { rpID: string; origins: string[] } {
  const configured = (process.env.AUTH_ORIGIN ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  if (configured.length) return { rpID: new URL(configured[0]).hostname, origins: configured };
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const hostname = host.split(":")[0];
  const proto = hostname === "localhost" || hostname === "127.0.0.1" ? "http" : "https";
  return { rpID: hostname, origins: [`${proto}://${host}`] };
}

// --- Challenge cookie ------------------------------------------------------

type Purpose = "register" | "login";

function sign(payload: string) {
  return createHmac("sha256", SECRET).update(`webauthn.${payload}`).digest("base64url");
}

export function setChallenge(res: NextResponse, challenge: string, purpose: Purpose, userId?: number) {
  const payload = Buffer.from(JSON.stringify({ c: challenge, p: purpose, u: userId ?? null, e: Date.now() + CHALLENGE_TTL_MS })).toString("base64url");
  res.cookies.set(CHALLENGE_COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth/passkey",
    maxAge: CHALLENGE_TTL_MS / 1000,
  });
}

export function readChallenge(req: NextRequest, purpose: Purpose): { challenge: string; userId: number | null } | null {
  const raw = req.cookies.get(CHALLENGE_COOKIE)?.value;
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const v = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { c: string; p: Purpose; u: number | null; e: number };
    if (v.p !== purpose || Date.now() > v.e) return null;
    return { challenge: v.c, userId: v.u };
  } catch {
    return null;
  }
}

export function clearChallenge(res: NextResponse) {
  res.cookies.delete({ name: CHALLENGE_COOKIE, path: "/api/auth/passkey" });
}

// --- Storage -------------------------------------------------------------

interface PasskeyRow {
  id: string;
  user_id: number;
  public_key: string;
  counter: string | number;
  transports: string | null;
  name: string | null;
  device_type: string | null;
  backed_up: boolean | null;
  created_at: string;
  last_used_at: string | null;
}

export interface PasskeySummary {
  id: string;
  name: string;
  synced: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

function toTransports(s: string | null): AuthenticatorTransportFuture[] | undefined {
  return s ? (s.split(",").filter(Boolean) as AuthenticatorTransportFuture[]) : undefined;
}

export async function listPasskeys(userId: number): Promise<PasskeySummary[]> {
  const sql = await getSql();
  const rows = (await sql`SELECT * FROM passkeys WHERE user_id = ${userId} ORDER BY created_at`) as PasskeyRow[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name ?? "Passkey",
    synced: Boolean(r.backed_up),
    createdAt: new Date(r.created_at).toISOString(),
    lastUsedAt: r.last_used_at ? new Date(r.last_used_at).toISOString() : null,
  }));
}

export async function deletePasskey(userId: number, id: string): Promise<boolean> {
  const sql = await getSql();
  const rows = (await sql`DELETE FROM passkeys WHERE id = ${id} AND user_id = ${userId} RETURNING id`) as { id: string }[];
  return rows.length > 0;
}

export async function renamePasskey(userId: number, id: string, name: string): Promise<void> {
  const sql = await getSql();
  await sql`UPDATE passkeys SET name = ${name.slice(0, 60)} WHERE id = ${id} AND user_id = ${userId}`;
}

// --- Registration (adding a passkey to a signed-in account) ---------------

export async function registrationOptions(req: NextRequest, user: { id: number; email: string }) {
  const sql = await getSql();
  const existing = (await sql`SELECT id, transports FROM passkeys WHERE user_id = ${user.id}`) as Pick<PasskeyRow, "id" | "transports">[];
  const { rpID } = relyingParty(req);
  return generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: user.email,
    userID: new TextEncoder().encode(`user:${user.id}`),
    attestationType: "none",
    // Don't let the same authenticator register twice.
    excludeCredentials: existing.map((p) => ({ id: p.id, transports: toTransports(p.transports) })),
    // Discoverable ("resident") credentials, so sign-in needs no email.
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });
}

export async function verifyRegistration(
  req: NextRequest,
  userId: number,
  expectedChallenge: string,
  response: RegistrationResponseJSON,
  name: string
): Promise<PasskeySummary | null> {
  const { rpID, origins } = relyingParty(req);
  const v = await verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin: origins, expectedRPID: rpID, requireUserVerification: false });
  if (!v.verified || !v.registrationInfo) return null;
  const { credential, credentialDeviceType, credentialBackedUp } = v.registrationInfo;
  const sql = await getSql();
  const now = new Date().toISOString();
  await sql`
    INSERT INTO passkeys (id, user_id, public_key, counter, transports, device_type, backed_up, name, created_at)
    VALUES (${credential.id}, ${userId}, ${Buffer.from(credential.publicKey).toString("base64url")}, ${credential.counter},
      ${(credential.transports ?? []).join(",")}, ${credentialDeviceType}, ${credentialBackedUp}, ${name.slice(0, 60)}, ${now})
    ON CONFLICT (id) DO NOTHING
  `;
  return { id: credential.id, name, synced: credentialBackedUp, createdAt: now, lastUsedAt: null };
}

// --- Authentication (signing in with a passkey) ---------------------------

export async function authenticationOptions(req: NextRequest) {
  const { rpID } = relyingParty(req);
  // No allowCredentials: the browser offers whichever passkeys it has for this site.
  return generateAuthenticationOptions({ rpID, userVerification: "preferred" });
}

/** Verifies a sign-in assertion; returns the user id it belongs to, or null. */
export async function verifyAuthentication(req: NextRequest, expectedChallenge: string, response: AuthenticationResponseJSON): Promise<number | null> {
  const sql = await getSql();
  const rows = (await sql`SELECT * FROM passkeys WHERE id = ${response.id}`) as PasskeyRow[];
  const pk = rows[0];
  if (!pk) return null;
  const { rpID, origins } = relyingParty(req);
  const v = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origins,
    expectedRPID: rpID,
    requireUserVerification: false,
    credential: { id: pk.id, publicKey: new Uint8Array(Buffer.from(pk.public_key, "base64url")), counter: Number(pk.counter), transports: toTransports(pk.transports) },
  });
  if (!v.verified) return null;
  await sql`UPDATE passkeys SET counter = ${v.authenticationInfo.newCounter}, last_used_at = now() WHERE id = ${pk.id}`;
  return pk.user_id;
}

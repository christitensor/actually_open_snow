import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Guards cron and operator-only diagnostic routes with
 * `Authorization: Bearer <CRON_SECRET>` (Vercel Cron sends that header
 * itself). Fails closed: with CRON_SECRET unset, production rejects every
 * request; only local development (NODE_ENV !== "production") is let through.
 * Returns a response to send back when unauthorized, or null to proceed.
 */
export function requireCronSecret(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV !== "production") return null;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

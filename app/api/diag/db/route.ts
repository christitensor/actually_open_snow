import { NextRequest, NextResponse } from "next/server";
import { getSql, isPostgresConfigured } from "@/lib/db/postgres";
import { requireCronSecret } from "@/lib/auth/cron";

// PERS-04 support: same reasoning as app/api/diag/email/route.ts — no tool
// available to read Vercel project env vars directly, so this is the only
// way to confirm DATABASE_URL/POSTGRES_URL actually took effect after
// adding a Postgres integration, without guessing. Operator-only: requires
// `Authorization: Bearer <CRON_SECRET>`. Never returns the connection
// string or the driver's error text (which can include host/user names) —
// the full error goes to the server log instead.
export async function GET(req: NextRequest) {
  const unauthorized = requireCronSecret(req);
  if (unauthorized) return unauthorized;

  if (!isPostgresConfigured) {
    return NextResponse.json({
      databaseConfigured: false,
      detail: "DATABASE_URL / POSTGRES_URL is not set in this deployment's environment variables.",
    });
  }

  try {
    const sql = await getSql();
    await sql`SELECT 1`;
    return NextResponse.json({ databaseConfigured: true, connected: true, detail: "Connected to Postgres." });
  } catch (err) {
    console.error("diag/db: Postgres connection failed:", err);
    return NextResponse.json({
      databaseConfigured: true,
      connected: false,
      detail: "DATABASE_URL is set but the connection failed — see the server logs for the error.",
    });
  }
}

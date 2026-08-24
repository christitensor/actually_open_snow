import { NextResponse } from "next/server";
import { getSql, isPostgresConfigured } from "@/lib/db/postgres";

// PERS-04 support: same reasoning as app/api/diag/email/route.ts — no tool
// available to read Vercel project env vars directly, so this is the only
// way to confirm DATABASE_URL/POSTGRES_URL actually took effect after
// adding a Postgres integration, without guessing. Never returns the
// connection string itself.
export async function GET() {
  if (!isPostgresConfigured) {
    return NextResponse.json({
      databaseConfigured: false,
      detail: "DATABASE_URL / POSTGRES_URL is not set in this deployment's environment variables — still on the SQLite fallback.",
    });
  }

  try {
    const sql = await getSql();
    await sql`SELECT 1`;
    return NextResponse.json({ databaseConfigured: true, connected: true, detail: "Connected to Postgres." });
  } catch (err) {
    return NextResponse.json({
      databaseConfigured: true,
      connected: false,
      detail: `DATABASE_URL is set but the connection failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

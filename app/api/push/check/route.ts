import { NextRequest, NextResponse } from "next/server";
import { checkAndPushAll } from "@/lib/alerts/check-and-push";
import { isPostgresConfigured } from "@/lib/db/postgres";
import { isPushConfigured } from "@/lib/push";
import { requireCronSecret } from "@/lib/auth/cron";

// PERS-06: cron entrypoint (vercel.json). Scheduled for 11:00 UTC — 4am
// MST / 5am MDT, early enough to be a wake-up call and late enough that
// most overnight snow has already fallen. Vercel Hobby crons can fire any
// time within the scheduled hour, hence the early side of the window.
// Safe to call repeatedly: each subscription is notified at most once per
// local day. Requires `Authorization: Bearer <CRON_SECRET>` (Vercel Cron
// sends it automatically); with CRON_SECRET unset, production rejects every
// call (lib/auth/cron.ts).
export async function GET(req: NextRequest) {
  const unauthorized = requireCronSecret(req);
  if (unauthorized) return unauthorized;
  if (!isPushConfigured || !isPostgresConfigured) {
    return NextResponse.json({ error: "Push or database not configured", isPushConfigured, isPostgresConfigured }, { status: 503 });
  }

  const results = await checkAndPushAll();
  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    totalSubscriptions: results.length,
    notifiedCount: results.filter((r) => r.pushResult?.sent).length,
    results,
  });
}

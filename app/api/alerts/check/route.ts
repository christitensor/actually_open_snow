import { NextRequest, NextResponse } from "next/server";
import { checkAndNotifyAll } from "@/lib/alerts/check-and-notify";

// PERS-03: the cron entrypoint, scheduled daily via vercel.json (once/day
// — the minimum interval Vercel Cron allows on the Hobby plan, and plenty
// for a once-per-calendar-day alert anyway) at 12:00 UTC — 5am Mountain
// Standard Time in ski season, before first tracks; drifts to 6am during
// Daylight Time, not worth a second cron entry to correct. Safe to call
// repeatedly regardless: each subscription is only notified once per
// calendar day (see lib/alerts/check-and-notify.ts).
//
// If CRON_SECRET is set, requires `Authorization: Bearer <secret>` so
// this can't be triggered by anyone who finds the URL. Unset by default
// for local dev convenience — set it before deploying somewhere public.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const results = await checkAndNotifyAll();
  const notified = results.filter((r) => r.crossed && !r.alreadyNotifiedToday);

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    totalSubscriptions: results.length,
    notifiedCount: notified.length,
    results,
  });
}

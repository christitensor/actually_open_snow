import { NextRequest, NextResponse } from "next/server";
import { checkAndNotifyAll } from "@/lib/alerts/check-and-notify";

// PERS-03: the "cron" entrypoint. Nothing in this sandbox/deployment
// schedules calls to this route automatically — wire it up externally
// (Vercel Cron hitting this path on a schedule, a GitHub Actions cron
// workflow, or an external pinger like cron-job.org) once deployed. Safe
// to call repeatedly: each subscription is only notified once per
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

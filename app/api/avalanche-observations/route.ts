import { NextResponse } from "next/server";
import { getRecentUacObservations } from "@/lib/data-sources/uac-observations";
import { serverError } from "@/lib/util/api";

// BC-03: recent Utah Avalanche Center field observations (avalanches and
// general conditions reports), for SkiMap's optional "Avalanche
// observations" mode. Server-routed (not fetched client-side directly)
// so the client never needs to know about utahavalanchecenter.org's
// undocumented API shape — see lib/data-sources/uac-observations.ts.
export async function GET() {
  try {
    const observations = await getRecentUacObservations();
    return NextResponse.json({ observations });
  } catch (err) {
    return serverError(err);
  }
}

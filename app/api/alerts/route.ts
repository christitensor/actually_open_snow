import { NextRequest, NextResponse } from "next/server";
import { getActiveAlerts } from "@/lib/data-sources/nws";
import { badRequest, parseLatLon } from "@/lib/util/api";

// SEV-01: active NWS alerts for a point. US-only — outside NWS coverage
// this returns an empty list rather than an error, since "no US severe
// weather alerts" is a valid (if uninformative) answer for those points.
export async function GET(req: NextRequest) {
  const coords = parseLatLon(req.nextUrl.searchParams);
  if (!coords) return badRequest("lat and lon query params are required and must be valid coordinates");

  try {
    const alerts = await getActiveAlerts(coords.lat, coords.lon);
    return NextResponse.json({ location: coords, alerts });
  } catch {
    return NextResponse.json({ location: coords, alerts: [], note: "NWS alerts unavailable for this point" });
  }
}

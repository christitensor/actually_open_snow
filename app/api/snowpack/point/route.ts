import { NextRequest, NextResponse } from "next/server";
import { getSnowpackAtPoint } from "@/lib/data-sources/nohrsc";
import { getElevation } from "@/lib/data-sources/open-meteo";
import { getMeasuredSnowNearPoints } from "@/lib/data-sources/snotel";
import { withTimeout } from "@/lib/util/with-timeout";
import { badRequest, parseLatLon, serverError } from "@/lib/util/api";

// Tap-to-inspect for the snowpack map layer: NOAA's modeled depth + SWE
// for the 1 km cell, plus the spot's elevation so "how much snow at this
// elevation" is answered in one popup. The nearest SNOTEL (within 10 mi)
// rides along as ground truth: NOAA's number is a 1 km-cell model average,
// and a sensor at one spot often reads higher or lower.
export async function GET(req: NextRequest) {
  const coords = parseLatLon(req.nextUrl.searchParams);
  if (!coords) return badRequest("lat and lon query params are required and must be valid coordinates");

  try {
    const [snowpack, elevation, measured] = await Promise.all([
      getSnowpackAtPoint(coords.lat, coords.lon),
      getElevation(coords.lat, coords.lon).catch(() => null),
      withTimeout(getMeasuredSnowNearPoints([coords], { maxMiles: 10 }), 3000)
        .then((m) => m[0] ?? null)
        .catch(() => null),
    ]);
    return NextResponse.json(
      { ...coords, ...snowpack, elevationFt: elevation?.elevationFt ?? null, nearestSnotel: measured },
      { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" } }
    );
  } catch (err) {
    return serverError(err);
  }
}

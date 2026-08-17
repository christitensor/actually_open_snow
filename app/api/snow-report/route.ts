import { NextRequest, NextResponse } from "next/server";
import { getRecent24hSnowfallIn } from "@/lib/data-sources/open-meteo";
import { badRequest, parseLatLon, serverError } from "@/lib/util/api";

// SNOW-01: estimated 24h snow report. See open-meteo.ts's
// getRecent24hSnowfallIn for the caveat — this is a reanalysis estimate,
// not a NOHRSC observation, until that integration is scoped.
export async function GET(req: NextRequest) {
  const coords = parseLatLon(req.nextUrl.searchParams);
  if (!coords) return badRequest("lat and lon query params are required and must be valid coordinates");

  try {
    const snowfallIn24h = await getRecent24hSnowfallIn(coords.lat, coords.lon);
    return NextResponse.json({
      location: coords,
      snowfallIn24h: Math.round(snowfallIn24h * 10) / 10,
      source: "open-meteo-reanalysis",
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return serverError(err);
  }
}

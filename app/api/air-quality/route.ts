import { NextRequest, NextResponse } from "next/server";
import { getAirQuality } from "@/lib/data-sources/open-meteo";
import { badRequest, parseLatLon, serverError } from "@/lib/util/api";

// SEV-06/07: current + forecast air quality (US AQI, PM2.5, PM10).
export async function GET(req: NextRequest) {
  const coords = parseLatLon(req.nextUrl.searchParams);
  if (!coords) return badRequest("lat and lon query params are required and must be valid coordinates");

  try {
    const aq = await getAirQuality(coords.lat, coords.lon);
    return NextResponse.json(aq);
  } catch (err) {
    return serverError(err);
  }
}

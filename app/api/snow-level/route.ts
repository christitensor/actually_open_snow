import { NextRequest, NextResponse } from "next/server";
import { getSnowLevelForLocation } from "@/lib/derive/snow-level";
import { badRequest, parseLatLon, serverError } from "@/lib/util/api";

// FC-10: snow level (rain/snow line) by elevation, NWS-primary with
// Open-Meteo freezing-level fallback/corroboration.
export async function GET(req: NextRequest) {
  const coords = parseLatLon(req.nextUrl.searchParams);
  if (!coords) return badRequest("lat and lon query params are required and must be valid coordinates");

  try {
    const snowLevel = await getSnowLevelForLocation(coords.lat, coords.lon);
    return NextResponse.json(snowLevel);
  } catch (err) {
    return serverError(err);
  }
}

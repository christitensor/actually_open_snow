import { NextRequest, NextResponse } from "next/server";
import { findNearbyStations } from "@/lib/data-sources/snotel";
import { badRequest, parseLatLon, serverError } from "@/lib/util/api";

// DATA-01: nearest SNOTEL stations to a point (Phase 1 scope: UT/ID only).
export async function GET(req: NextRequest) {
  const coords = parseLatLon(req.nextUrl.searchParams);
  if (!coords) return badRequest("lat and lon query params are required and must be valid coordinates");

  try {
    const stations = await findNearbyStations(coords.lat, coords.lon);
    return NextResponse.json({ location: coords, stations });
  } catch (err) {
    return serverError(err);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getElevationAdjustedDaily } from "@/lib/data-sources/open-meteo";
import { badRequest, parseLatLon, serverError } from "@/lib/util/api";

// FC-10-adj: elevation-adjuster slider backend. Separate from /api/forecast
// (daily-only, no hourly) since this is refetched on every slider move.
export async function GET(req: NextRequest) {
  const coords = parseLatLon(req.nextUrl.searchParams);
  if (!coords) return badRequest("lat and lon query params are required and must be valid coordinates");

  const elevationFt = Number(req.nextUrl.searchParams.get("elevationFt"));
  if (!Number.isFinite(elevationFt)) return badRequest("elevationFt query param is required and must be a number");

  try {
    const daily = await getElevationAdjustedDaily(coords.lat, coords.lon, elevationFt / 3.28084);
    return NextResponse.json({ daily });
  } catch (err) {
    return serverError(err);
  }
}

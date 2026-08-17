import { NextRequest, NextResponse } from "next/server";
import { getForecast } from "@/lib/data-sources/open-meteo";
import { badRequest, parseLatLon, serverError } from "@/lib/util/api";

// FC-01/02/03/04: multi-day + hourly forecast for any point.
export async function GET(req: NextRequest) {
  const coords = parseLatLon(req.nextUrl.searchParams);
  if (!coords) return badRequest("lat and lon query params are required and must be valid coordinates");

  try {
    const forecast = await getForecast(coords.lat, coords.lon);
    return NextResponse.json(forecast);
  } catch (err) {
    return serverError(err);
  }
}

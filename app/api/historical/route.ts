import { NextRequest, NextResponse } from "next/server";
import { getHistoricalWeather } from "@/lib/data-sources/open-meteo";
import { badRequest, parseLatLon, serverError } from "@/lib/util/api";

// SNOW-05: historical daily weather lookback. Defaults to the last 14 days
// when start/end aren't given, capped at 90 days to keep responses small.
export async function GET(req: NextRequest) {
  const coords = parseLatLon(req.nextUrl.searchParams);
  if (!coords) return badRequest("lat and lon query params are required and must be valid coordinates");

  const today = new Date();
  const defaultEnd = today.toISOString().slice(0, 10);
  const defaultStart = new Date(today.getTime() - 14 * 86400000).toISOString().slice(0, 10);

  const startDate = req.nextUrl.searchParams.get("start") ?? defaultStart;
  const endDate = req.nextUrl.searchParams.get("end") ?? defaultEnd;

  const spanDays = (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000;
  if (!(spanDays >= 0 && spanDays <= 90)) {
    return badRequest("date range must be between 0 and 90 days (start <= end)");
  }

  try {
    const days = await getHistoricalWeather(coords.lat, coords.lon, startDate, endDate);
    return NextResponse.json({ location: coords, days });
  } catch (err) {
    return serverError(err);
  }
}

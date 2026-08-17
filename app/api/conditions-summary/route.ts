import { NextRequest, NextResponse } from "next/server";
import { getForecast, getMultiModelDailySnowfall } from "@/lib/data-sources/open-meteo";
import { getPointMeta } from "@/lib/data-sources/nws";
import { getLatestAfd } from "@/lib/data-sources/nws-products";
import { findNearbyStations, getLatestReading } from "@/lib/data-sources/snotel";
import { buildConditionsSummary } from "@/lib/derive/conditions-summary";
import { badRequest, parseLatLon } from "@/lib/util/api";

// SNOW-03: multi-source corroborated conditions summary. Pulls NWS's
// forecaster-written AFD, our multi-model snowfall spread, and the
// nearest SNOTEL reading in parallel, then reconciles them — see
// lib/derive/conditions-summary.ts for the corroboration logic.
export async function GET(req: NextRequest) {
  const coords = parseLatLon(req.nextUrl.searchParams);
  if (!coords) return badRequest("lat and lon query params are required and must be valid coordinates");
  const name = req.nextUrl.searchParams.get("name") ?? "This location";

  const forecast = await getForecast(coords.lat, coords.lon);

  const [multiModel, afd, snotel] = await Promise.allSettled([
    getMultiModelDailySnowfall(coords.lat, coords.lon),
    getPointMeta(coords.lat, coords.lon).then((meta) => getLatestAfd(meta.wfo)),
    findNearbyStations(coords.lat, coords.lon, 1).then((stations) =>
      stations[0] ? getLatestReading(stations[0]) : null
    ),
  ]);

  const multiModelTodaySnowfallIn =
    multiModel.status === "fulfilled" ? Object.values(multiModel.value).map((d) => d[0] ?? 0) : [];

  const summary = buildConditionsSummary({
    location: { ...coords, name },
    forecast,
    multiModelTodaySnowfallIn,
    afd: afd.status === "fulfilled" ? afd.value : null,
    recentSnotel: snotel.status === "fulfilled" ? snotel.value : null,
  });

  return NextResponse.json(summary);
}

// Orchestrates every data source into one payload for a location dashboard
// page — this is the one place resort pages and backcountry pin pages
// (MAP-17) share logic, since both are just a Location per
// ARCHITECTURE.md's coordinate-first model.

import { getElevation, getForecast, getMultiModelDailySnowfall } from "@/lib/data-sources/open-meteo";
import { getActiveAlerts, getPointMeta } from "@/lib/data-sources/nws";
import { getLatestAfd } from "@/lib/data-sources/nws-products";
import { getZoneMapLayer, getAvalancheForecast } from "@/lib/data-sources/avalanche-org";
import { findNearbyStations, getLatestReading } from "@/lib/data-sources/snotel";
import { findZoneForPoint } from "@/lib/derive/avalanche-zone-lookup";
import { getSnowLevelForLocation, elevationVsSnowLine, type ElevationVsSnowLine } from "@/lib/derive/snow-level";
import { estimateDailyPowderQuality } from "@/lib/derive/powder-quality";
import { buildConditionsSummary } from "@/lib/derive/conditions-summary";
import type {
  AvalancheForecast,
  AvalancheZone,
  ConditionsSummary,
  ForecastResponse,
  Location,
  NwsAlert,
  SnotelReading,
  SnowLevelResponse,
} from "@/lib/models/types";

export interface LocationDashboardData {
  location: Location;
  elevationFt: number | null;
  forecast: ForecastResponse;
  snowLevel: SnowLevelResponse;
  /** How this location's (base) elevation compares to the current snow level — see components/location for per-band (base/mid/summit) resort detail */
  snowLineStatus: ElevationVsSnowLine;
  powderQualityToday: ReturnType<typeof estimateDailyPowderQuality>;
  alerts: NwsAlert[];
  avalancheZone: AvalancheZone | null;
  avalancheForecast: AvalancheForecast | null;
  conditionsSummary: ConditionsSummary;
  nearestSnotel: SnotelReading | null;
}

export async function getLocationDashboardData(location: Location): Promise<LocationDashboardData> {
  const { lat, lon } = location;

  const [elevationResult, forecast, snowLevel, alerts, avalancheZoneResult, snotelResult] =
    await Promise.all([
      location.elevationFt != null
        ? Promise.resolve({ elevationFt: location.elevationFt })
        : getElevation(lat, lon).catch(() => null),
      getForecast(lat, lon),
      getSnowLevelForLocation(lat, lon),
      getActiveAlerts(lat, lon).catch(() => [] as NwsAlert[]),
      getZoneMapLayer()
        .then((layer) => findZoneForPoint(layer, lat, lon))
        .catch(() => null),
      findNearbyStations(lat, lon, 1)
        .then((stations) => (stations[0] ? getLatestReading(stations[0]) : null))
        .catch(() => null),
    ]);

  const elevationFt = elevationResult?.elevationFt ?? null;
  const latestSnowLevelPoint = snowLevel.points[0];

  const avalancheForecast = avalancheZoneResult
    ? await getAvalancheForecast(avalancheZoneResult.zoneId).catch(() => null)
    : null;

  const [afd, multiModel] = await Promise.all([
    getPointMeta(lat, lon)
      .then((meta) => getLatestAfd(meta.wfo))
      .catch(() => null),
    getMultiModelDailySnowfall(lat, lon).catch(() => null),
  ]);

  const conditionsSummary = buildConditionsSummary({
    location: { lat, lon, name: location.name },
    forecast,
    multiModelTodaySnowfallIn: multiModel ? Object.values(multiModel).map((d) => d[0] ?? 0) : [],
    afd,
    recentSnotel: snotelResult,
  });

  const todaysHours = forecast.hourly.filter((h) => h.time.startsWith(forecast.daily[0]?.date ?? ""));

  return {
    location,
    elevationFt,
    forecast,
    snowLevel,
    snowLineStatus: elevationFt != null ? elevationVsSnowLine(elevationFt, latestSnowLevelPoint) : "unknown",
    powderQualityToday: estimateDailyPowderQuality(todaysHours),
    alerts,
    avalancheZone: avalancheZoneResult,
    avalancheForecast,
    conditionsSummary,
    nearestSnotel: snotelResult,
  };
}

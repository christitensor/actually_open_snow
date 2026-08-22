// Orchestrates every data source into one payload for a location dashboard
// page — this is the one place resort pages and backcountry pin pages
// (MAP-17) share logic, since both are just a Location per
// ARCHITECTURE.md's coordinate-first model.

import {
  getAirQuality,
  getElevation,
  getForecast,
  getHistoricalWeather,
  getMultiModelDailySnowfall,
  getRecentHourlyWindow,
} from "@/lib/data-sources/open-meteo";
import { getActiveAlerts, getNearbyStations, getPointMeta, getStationObservation, type NwsStation } from "@/lib/data-sources/nws";
import { getKeyStationsForZone } from "@/data/key-stations";
import { getLatestAfd } from "@/lib/data-sources/nws-products";
import { getZoneMapLayer, getAvalancheForecast } from "@/lib/data-sources/avalanche-org";
import { findNearbyStations, getLatestReading } from "@/lib/data-sources/snotel";
import { findZoneForPoint } from "@/lib/derive/avalanche-zone-lookup";
import {
  getSnowLevelForLocation,
  elevationVsSnowLine,
  computeDailySnowLines,
  type ElevationVsSnowLine,
} from "@/lib/derive/snow-level";
import { estimateDailyPowderQuality } from "@/lib/derive/powder-quality";
import { estimateTrailConditions, type TrailConditionsEstimate } from "@/lib/derive/trail-conditions";
import { wetBulbF } from "@/lib/derive/wet-bulb";
import { buildConditionsSummary } from "@/lib/derive/conditions-summary";
import type {
  AfdProduct,
  AirQuality,
  AvalancheForecast,
  AvalancheZone,
  ConditionsSummary,
  DailySnowLine,
  ForecastResponse,
  HistoricalDay,
  KeyStationReading,
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
  /** FC-10: one afternoon snow-line estimate per day in `forecast.daily`, same order/length */
  dailySnowLines: DailySnowLine[];
  powderQualityToday: ReturnType<typeof estimateDailyPowderQuality>;
  trailConditions: TrailConditionsEstimate | null;
  wetBulbNowF: number | null;
  alerts: NwsAlert[];
  avalancheZone: AvalancheZone | null;
  avalancheForecast: AvalancheForecast | null;
  conditionsSummary: ConditionsSummary;
  /** SNOW-03/EXP-01: the raw NWS forecast discussion text itself, not just conditionsSummary's one-line mention of it — see components/location/ForecastDiscussion.tsx */
  afd: AfdProduct | null;
  nearestSnotel: SnotelReading | null;
  nearestNwsStations: NwsStation[];
  /** DATA-01-adj: curated high-elevation stations (data/key-stations.ts) for this location's avalanche zone, if it has any — the generic nearest-station picker above tends to surface valley airports instead. */
  keyStations: KeyStationReading[];
  keyStationsRangeName: string | null;
  airQuality: AirQuality | null;
  /** FC-05/06: today's forecast snowfall (inches) per model, for the "do models agree" UI */
  multiModelTodaySnowfallIn: Record<string, number> | null;
  /** SNOW-05: last 15 days, most recent last — feeds both the "Past 7 days" table (last 7 of these) and the Snow Summary timeline's past-day buckets */
  pastDays: HistoricalDay[];
  /** FC-02: next 24 hours from now, for the hourly forecast table. Computed here (not in the component) since Date.now() is an impure call React's hooks lint won't allow in render. */
  upcomingHours: ForecastResponse["hourly"];
}

const HOURLY_DISPLAY_HOURS = 24;
const PAST_DAYS_LOOKBACK = 15; // matches the Snow Summary timeline's "Prev 11-15 Days" bucket

export async function getLocationDashboardData(location: Location): Promise<LocationDashboardData> {
  const { lat, lon } = location;

  // Forecast goes first, sequenced ahead of the rest: snow level reuses its
  // hourly freezing-level data rather than re-fetching it (a duplicate
  // Open-Meteo call caught by live testing), so it can't run fully in
  // parallel with forecast the way the other independent sources can.
  const forecast = await getForecast(lat, lon);

  const [elevationResult, snowLevel, alerts, avalancheZoneResult, snotelResult, nwsStations, airQuality, recentWindow] =
    await Promise.all([
      location.elevationFt != null
        ? Promise.resolve({ elevationFt: location.elevationFt })
        : getElevation(lat, lon).catch(() => null),
      getSnowLevelForLocation(lat, lon, forecast.hourly),
      getActiveAlerts(lat, lon).catch(() => [] as NwsAlert[]),
      getZoneMapLayer()
        .then((layer) => findZoneForPoint(layer, lat, lon))
        .catch(() => null),
      findNearbyStations(lat, lon, 1)
        .then((stations) => (stations[0] ? getLatestReading(stations[0]) : null))
        .catch(() => null),
      getNearbyStations(lat, lon).catch(() => [] as NwsStation[]),
      getAirQuality(lat, lon).catch(() => null),
      getRecentHourlyWindow(lat, lon).catch(() => []),
    ]);

  const today = new Date();
  const lookbackStart = new Date(today.getTime() - PAST_DAYS_LOOKBACK * 86400000);
  const pastDays = await getHistoricalWeather(
    lat,
    lon,
    lookbackStart.toISOString().slice(0, 10),
    today.toISOString().slice(0, 10)
  ).catch(() => [] as HistoricalDay[]);

  const elevationFt = elevationResult?.elevationFt ?? null;
  const latestSnowLevelPoint = snowLevel.points[0];

  const avalancheForecast = avalancheZoneResult
    ? await getAvalancheForecast(avalancheZoneResult.zoneId).catch(() => null)
    : null;

  const zoneKeyStations = getKeyStationsForZone(avalancheZoneResult?.zoneId);

  const [afd, multiModel, keyStationReadings] = await Promise.all([
    getPointMeta(lat, lon)
      .then((meta) => getLatestAfd(meta.wfo))
      .catch(() => null),
    getMultiModelDailySnowfall(lat, lon).catch(() => null),
    zoneKeyStations
      ? Promise.all(
          zoneKeyStations.stations.map(async (s) => {
            const obs = await getStationObservation(s.nwsId).catch(() => null);
            return {
              name: s.name,
              elevationFt: s.elevationFt,
              tempF: obs?.tempF ?? null,
              windSpeedMph: obs?.windSpeedMph ?? null,
              windDirectionDeg: obs?.windDirectionDeg ?? null,
              timestamp: obs?.timestamp ?? null,
            } satisfies KeyStationReading;
          })
        )
      : Promise.resolve([] as KeyStationReading[]),
  ]);

  const multiModelTodaySnowfallIn = multiModel
    ? Object.fromEntries(Object.entries(multiModel).map(([model, days]) => [model, days[0] ?? 0]))
    : null;

  const conditionsSummary = buildConditionsSummary({
    location: { lat, lon, name: location.name },
    forecast,
    multiModelTodaySnowfallIn: multiModelTodaySnowfallIn ? Object.values(multiModelTodaySnowfallIn) : [],
    afd,
    recentSnotel: snotelResult,
  });

  const todaysHours = forecast.hourly.filter((h) => h.time.startsWith(forecast.daily[0]?.date ?? ""));

  const nearestFutureHour = forecast.hourly.find((h) => new Date(h.time).getTime() >= Date.now()) ?? forecast.hourly[0];
  const wetBulbNowF = nearestFutureHour
    ? wetBulbF(nearestFutureHour.temperatureF, nearestFutureHour.relativeHumidityPct)
    : null;

  return {
    location,
    elevationFt,
    forecast,
    snowLevel,
    snowLineStatus: elevationFt != null ? elevationVsSnowLine(elevationFt, latestSnowLevelPoint) : "unknown",
    dailySnowLines: computeDailySnowLines(forecast.daily, forecast.hourly, snowLevel.points, forecast.utcOffsetSeconds),
    powderQualityToday: estimateDailyPowderQuality(todaysHours),
    trailConditions: estimateTrailConditions(recentWindow),
    wetBulbNowF,
    alerts,
    avalancheZone: avalancheZoneResult,
    avalancheForecast,
    conditionsSummary,
    afd,
    nearestSnotel: snotelResult,
    nearestNwsStations: nwsStations,
    keyStations: keyStationReadings,
    keyStationsRangeName: zoneKeyStations?.rangeName ?? null,
    airQuality,
    multiModelTodaySnowfallIn,
    pastDays,
    upcomingHours: forecast.hourly.filter((h) => new Date(h.time).getTime() >= Date.now()).slice(0, HOURLY_DISPLAY_HOURS),
  };
}

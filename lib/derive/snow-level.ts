// FC-10: snow level (rain/snow line) by elevation. NWS gridpoint `snowLevel`
// is the primary source (direct field, US only); Open-Meteo's
// freezing_level_height fills in outside NWS coverage and corroborates it
// inside. Resolves against a location's elevation so the UI can say
// "raining at base, snowing above 8,200 ft."

import { getForecast } from "@/lib/data-sources/open-meteo";
import { getSnowLevel } from "@/lib/data-sources/nws";
import type { DailyForecastDay, DailySnowLine, HourlyForecastPoint, SnowLevelPoint, SnowLevelResponse } from "@/lib/models/types";

function nearestByTime<T extends { time: string }>(list: T[], targetIso: string): T | undefined {
  const target = new Date(targetIso).getTime();
  return list.reduce<{ item: T; diff: number } | undefined>((best, item) => {
    const diff = Math.abs(new Date(item.time).getTime() - target);
    if (!best || diff < best.diff) return { item, diff };
    return best;
  }, undefined)?.item;
}

/**
 * @param hourlyFreezingLevel Reuse the freezing level already present in a
 *   ForecastResponse's `hourly` array when the caller has one (the main
 *   dashboard path does) — `getForecast()` requests
 *   `freezing_level_height` as part of its normal hourly call, so a
 *   second Open-Meteo request just for freezing level was a genuinely
 *   redundant call, caught by live load-testing. Only fetched here as a
 *   fallback for callers (like the standalone `/api/snow-level` route)
 *   that don't already have a forecast in hand.
 */
export async function getSnowLevelForLocation(
  lat: number,
  lon: number,
  hourlyFreezingLevel?: { time: string; freezingLevelFt: number }[]
): Promise<SnowLevelResponse> {
  const freezingLevel = hourlyFreezingLevel ?? (await getForecast(lat, lon)).hourly;

  let nwsPoints: SnowLevelPoint[] = [];
  let nwsAvailable = true;
  try {
    nwsPoints = await getSnowLevel(lat, lon);
  } catch {
    // Outside NWS/US coverage, or the point/gridpoint lookup failed — fall
    // back to Open-Meteo freezing level only.
    nwsAvailable = false;
  }

  if (nwsAvailable && nwsPoints.length > 0) {
    const merged: SnowLevelPoint[] = nwsPoints.map((p) => ({
      ...p,
      freezingLevelFt: nearestByTime(freezingLevel, p.time)?.freezingLevelFt ?? null,
    }));
    return { location: { lat, lon }, points: merged, nwsAvailable: true };
  }

  const fallbackPoints: SnowLevelPoint[] = freezingLevel.map((f) => ({
    time: f.time,
    snowLevelFt: null,
    freezingLevelFt: f.freezingLevelFt,
  }));
  return { location: { lat, lon }, points: fallbackPoints, nwsAvailable: false };
}

export type ElevationVsSnowLine = "above" | "below" | "unknown";

/** Resolves a resort/pin elevation against the current snow level for the UI's indicator. */
export function elevationVsSnowLine(
  elevationFt: number,
  point: SnowLevelPoint | undefined
): ElevationVsSnowLine {
  const level = point?.snowLevelFt ?? point?.freezingLevelFt;
  if (level == null) return "unknown";
  return elevationFt >= level ? "above" : "below";
}

const AFTERNOON_LOCAL_HOUR = 14; // 2pm — matches the conventional "afternoon snow line" read

/**
 * FC-10 per-day rollup for the daily forecast table. NWS gridpoint
 * `snowLevel` only covers ~7 days out, so it's preferred when a sample
 * falls within 4h of the target afternoon hour; beyond that (or outside
 * NWS/US coverage) this falls back to Open-Meteo's `freezing_level_height`,
 * which is available for the full 16-day forecast window since it comes
 * from the same `hourly` block `getForecast()` already fetches.
 *
 * Two different "target 2pm" instants are used deliberately. `day.date` and
 * `hourly[].time` are both bare local-time strings with no UTC offset
 * attached (Open-Meteo's `timezone=auto`), so matching between them with a
 * naively-parsed target is self-consistent regardless of what timezone the
 * server process itself is running in — both sides get the same
 * (mis)interpretation, which cancels out. NWS's `validTime`, in contrast,
 * carries a real UTC offset, so comparing it against that same naive target
 * silently compared the wrong absolute hour (off by the full UTC offset,
 * ~6-7h for this app's Mountain-time coverage area) — caught live via a
 * snow line that came out ~8 hours off from the intended afternoon read.
 * `utcOffsetSeconds` (from the same Open-Meteo response) corrects the NWS
 * comparison to a genuine UTC instant: local = UTC + offset, so
 * UTC = local - offset, i.e. `naiveMs - utcOffsetSeconds * 1000`.
 */
export function computeDailySnowLines(
  daily: DailyForecastDay[],
  hourly: HourlyForecastPoint[],
  snowLevelPoints: SnowLevelPoint[],
  utcOffsetSeconds: number
): DailySnowLine[] {
  return daily.map((day) => {
    const naiveTargetMs = new Date(`${day.date}T${String(AFTERNOON_LOCAL_HOUR).padStart(2, "0")}:00`).getTime();
    const trueTargetMs = naiveTargetMs - utcOffsetSeconds * 1000;

    const nearestHour = hourly.reduce<HourlyForecastPoint | undefined>((best, h) => {
      const diff = Math.abs(new Date(h.time).getTime() - naiveTargetMs);
      const bestDiff = best ? Math.abs(new Date(best.time).getTime() - naiveTargetMs) : Infinity;
      return diff < bestDiff ? h : best;
    }, undefined);

    const nearestNws = snowLevelPoints.reduce<{ point: SnowLevelPoint; diffMs: number } | undefined>((best, p) => {
      if (p.snowLevelFt == null) return best;
      const diffMs = Math.abs(new Date(p.time).getTime() - trueTargetMs);
      return !best || diffMs < best.diffMs ? { point: p, diffMs } : best;
    }, undefined);

    if (nearestNws && nearestNws.diffMs <= 4 * 3600_000) {
      return { date: day.date, snowLineFt: nearestNws.point.snowLevelFt, source: "nws" };
    }

    return { date: day.date, snowLineFt: nearestHour?.freezingLevelFt ?? null, source: "estimated" };
  });
}

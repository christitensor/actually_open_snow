// FC-10: snow level (rain/snow line) by elevation. NWS gridpoint `snowLevel`
// is the primary source (direct field, US only); Open-Meteo's
// freezing_level_height fills in outside NWS coverage and corroborates it
// inside. Resolves against a location's elevation so the UI can say
// "raining at base, snowing above 8,200 ft."

import { getFreezingLevelFt } from "@/lib/data-sources/open-meteo";
import { getSnowLevel } from "@/lib/data-sources/nws";
import type { SnowLevelPoint, SnowLevelResponse } from "@/lib/models/types";

function nearestByTime<T extends { time: string }>(list: T[], targetIso: string): T | undefined {
  const target = new Date(targetIso).getTime();
  return list.reduce<{ item: T; diff: number } | undefined>((best, item) => {
    const diff = Math.abs(new Date(item.time).getTime() - target);
    if (!best || diff < best.diff) return { item, diff };
    return best;
  }, undefined)?.item;
}

export async function getSnowLevelForLocation(lat: number, lon: number): Promise<SnowLevelResponse> {
  const freezingLevel = await getFreezingLevelFt(lat, lon);

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

import type { Location, Resort } from "@/lib/models/types";
import rawResorts from "./resorts.json";

/**
 * Phase 1 seed list (RES-01/RES-02): Northern Utah + Southeast Idaho only,
 * per TRACE_MATRIX.md "Phase 1 regional scope."
 *
 * Coordinates and elevations are from public general knowledge, not an
 * authoritative single source (no free API provides this) — treat as
 * approximate and verify/correct against each resort's own published trail
 * map stats before relying on this for anything beyond development.
 */
export const resorts: Resort[] = rawResorts as Resort[];

/**
 * Resorts to always show at the top of the landing page, ahead of
 * favorites and everything else — edit this list directly when your
 * regular rotation changes. Anything favorited via the star toggle joins
 * this set too (see components/location/ResortList.tsx), so this is just
 * the starting default, not the only way in.
 */
export const primaryResortIds: string[] = ["snowbasin", "beaver-mountain"];

export function getResortById(id: string): Resort | undefined {
  return resorts.find((r) => r.id === id);
}

export function resortToLocation(resort: Resort): Location {
  return {
    lat: resort.lat,
    lon: resort.lon,
    source: "resort",
    resortId: resort.id,
    name: resort.name,
    elevationFt: resort.baseElevationFt,
    minElevationFt: resort.baseElevationFt,
    maxElevationFt: resort.summitElevationFt,
  };
}

export function pinToLocation(lat: number, lon: number, name = "Custom Pin"): Location {
  return { lat, lon, source: "pin", name };
}

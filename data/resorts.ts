import type { Location, Resort } from "@/lib/models/types";
import rawResorts from "./resorts.json";

/**
 * Curated resorts (RES-01/RES-02). The first 16 are the Phase 1 seed list
 * (Northern Utah + Southeast Idaho, TRACE_MATRIX.md), from public general
 * knowledge. The rest (Nov 2026) are every public, operating, lift-served
 * downhill area within 500 mi (straight line) of Salt Lake City in
 * OpenSkiData (openskimap.org, ODbL): at least 2 lifts and 500 ft of
 * vertical, or 1 lift and 1,000 ft, minus private clubs, tubing hills and
 * training parks. Their base/summit are the lowest/highest mapped run or
 * lift point, rounded to 10 ft — approximate, like the seed list; verify
 * against a resort's own trail-map stats before relying on them.
 */
export const resorts: Resort[] = rawResorts as Resort[];

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

/** Link to a pin's page; with a saved name, the page renders already titled with it. */
export function pinHref(lat: number, lon: number, name?: string): string {
  return `/location/pin?lat=${lat}&lon=${lon}${name ? `&name=${encodeURIComponent(name)}` : ""}`;
}

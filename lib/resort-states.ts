// Home-page "by state" view: which state's resorts to show first, and how
// far each one is from the viewer. Plain data + pure functions, shared by
// the server (app/page.tsx picks the default) and the client list.

import { haversineMiles } from "@/lib/util/geo";

export const STATE_NAMES: Record<string, string> = {
  AZ: "Arizona",
  CA: "California",
  CO: "Colorado",
  ID: "Idaho",
  MT: "Montana",
  NM: "New Mexico",
  NV: "Nevada",
  OR: "Oregon",
  SD: "South Dakota",
  UT: "Utah",
  WA: "Washington",
  WY: "Wyoming",
};

/** The dropdown's "every state" value (stored in preferences as-is). */
export const ALL_STATES = "ALL";

/** Where the app started — used when we know nothing about the viewer's location. */
export const FALLBACK_STATE = "UT";
export const FALLBACK_ORIGIN = { lat: 40.7608, lon: -111.891, label: "Salt Lake City" };

export type OriginSource = "gps" | "ip" | "fallback";
export interface Origin {
  lat: number;
  lon: number;
  source: OriginSource;
}

export function stateName(code: string): string {
  return code === ALL_STATES ? "All states" : (STATE_NAMES[code] ?? code);
}

/**
 * Default state for a viewer: their own state when it has resorts, else
 * the state of the resort nearest to them (someone in Kansas gets
 * Colorado), else Utah.
 */
export function pickDefaultState(
  resorts: { state: string; lat: number; lon: number }[],
  viewer: { region?: string | null; lat?: number | null; lon?: number | null }
): string {
  const states = new Set(resorts.map((r) => r.state));
  if (viewer.region && states.has(viewer.region)) return viewer.region;
  if (viewer.lat != null && viewer.lon != null) {
    let best: { state: string; d: number } | null = null;
    for (const r of resorts) {
      const d = haversineMiles(viewer.lat, viewer.lon, r.lat, r.lon);
      if (!best || d < best.d) best = { state: r.state, d };
    }
    if (best) return best.state;
  }
  return FALLBACK_STATE;
}

export function milesFrom(origin: { lat: number; lon: number }, p: { lat: number; lon: number }): number {
  return haversineMiles(origin.lat, origin.lon, p.lat, p.lon);
}

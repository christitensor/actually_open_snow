// FC-10-adj: how much wetter it gets per 1,000 ft of climb, calibrated
// against nearby SNOTEL gauges instead of one hard-coded number.
//
// Method: fit ln(mean water-year precip) against elevation across nearby
// stations (distance-weighted), so the slope is a % change per 1,000 ft.
// The raw fit is noisy — prototyped Nov 2026 against real AWDB data, a
// 25mi radius around Alta mixes the wet Cottonwoods with drier Park City
// and gets r² ≈ 0.2 for a 17.5%/kft slope, while Snowbasin's neighbors
// show essentially no elevation signal at all. Exposure (windward vs.
// lee) explains as much as elevation, and SNOTEL sites cluster in a
// narrow 7-9k ft band. So the fit is blended toward a default in
// proportion to how much of the station spread elevation actually
// explains (r²) and how many stations back it — a weak fit nudges the
// default rather than replacing it.
//
// Known bias: SNOTEL gauges under-catch wind-blown snow, and the windiest
// sites tend to be the highest, so if anything this under-states the real
// gradient.

import type { PrecipGradient } from "@/lib/models/types";

/** Mid-range of commonly cited intermountain-West orographic gradients; used alone when there's no usable fit. */
export const DEFAULT_PRECIP_GRADIENT_PER_KFT = 0.07;
/** Physically plausible ceiling for a within-range gradient — the raw fit can exceed this when it's really measuring windward-vs-lee. */
const MAX_PER_KFT = 0.15;
const MIN_STATIONS = 4;
/** Below this elevation spread the slope is mostly noise. */
const MIN_ELEVATION_SPREAD_FT = 800;
/** Stations this far away count half as much as one on top of the point. */
const HALF_WEIGHT_MI = 10;
/** Station count at which the fit gets full weight (still scaled by r²). */
const FULL_CONFIDENCE_STATIONS = 6;

export interface GradientStation {
  elevationFt: number;
  /** Mean water-year precipitation (inches) */
  meanPrecipIn: number;
  distanceMi: number;
}

export function defaultPrecipGradient(stationCount = 0): PrecipGradient {
  return { perKft: DEFAULT_PRECIP_GRADIENT_PER_KFT, source: "default", fitPerKft: null, r2: null, stationCount };
}

export function fitPrecipGradient(stations: GradientStation[]): PrecipGradient {
  const usable = stations.filter((s) => s.meanPrecipIn > 0 && Number.isFinite(s.elevationFt));
  const elevations = usable.map((s) => s.elevationFt);
  if (usable.length < MIN_STATIONS || Math.max(...elevations) - Math.min(...elevations) < MIN_ELEVATION_SPREAD_FT) {
    return defaultPrecipGradient(usable.length);
  }

  // Weighted least squares of y = ln(precip) on x = elevation in kft.
  const pts = usable.map((s) => ({
    x: s.elevationFt / 1000,
    y: Math.log(s.meanPrecipIn),
    w: 1 / (1 + (s.distanceMi / HALF_WEIGHT_MI) ** 2),
  }));
  const sw = pts.reduce((a, p) => a + p.w, 0);
  const mx = pts.reduce((a, p) => a + p.w * p.x, 0) / sw;
  const my = pts.reduce((a, p) => a + p.w * p.y, 0) / sw;
  const sxx = pts.reduce((a, p) => a + p.w * (p.x - mx) ** 2, 0);
  const sxy = pts.reduce((a, p) => a + p.w * (p.x - mx) * (p.y - my), 0);
  const syy = pts.reduce((a, p) => a + p.w * (p.y - my) ** 2, 0);
  const slope = sxy / sxx;
  const r2 = syy > 0 ? (sxy * sxy) / (sxx * syy) : 0;

  const fitPerKft = Math.exp(slope) - 1;
  const confidence = r2 * Math.min(1, usable.length / FULL_CONFIDENCE_STATIONS);
  const clampedFit = Math.min(MAX_PER_KFT, Math.max(0, fitPerKft));
  const perKft = confidence * clampedFit + (1 - confidence) * DEFAULT_PRECIP_GRADIENT_PER_KFT;

  return { perKft, source: "snotel", fitPerKft, r2, stationCount: usable.length };
}

// FC-10-adj: snow and precip at any elevation on the mountain.
//
// Why this exists: the slider used to just re-ask Open-Meteo with an
// `elevation` override. That adjusts temperature (and somewhat precip),
// but Open-Meteo's snowfall is precip × a flat ~7:1 ratio, and its ~10km
// global models barely resolve a single Wasatch ridge. So above the snow
// line every elevation got nearly the same snow, well under what NOAA
// shows for the upper mountain. NOAA's numbers differ by elevation for
// two physical reasons, both modeled here:
//
//   1. Orographic precip: rising air wrings out more water higher up.
//      Precip scales by (1 + g)^(Δft/1000), with g calibrated per-area
//      from SNOTEL (lib/derive/precip-gradient.ts).
//   2. Snow-to-liquid ratio: colder air → fluffier snow. A Kuchera-style
//      curve on the lapse-rate-adjusted temperature (≈8:1 at 32°F, 12:1
//      at 28°F, capped at 18:1) — plus a rain/snow split from the snow
//      level.
//
// Base data: NWS gridpoint QPF/snowfall for days ~1-7 (same source as
// NOAA's point forecasts), anchored so that at the NWS grid cell's own
// elevation the output reproduces NWS's snowfall, and the model only
// supplies the *change* with elevation. Open-Meteo hourly beyond NWS
// range or outside the US, run through the same model.
//
// Pure and dependency-free so the client can rerun it on every slider
// move with no network calls.

import type { ElevationAdjustedDay, ElevationModelInputs, NwsPrecipPeriod } from "@/lib/models/types";

/** °F of cooling per 1,000 ft. Between the dry (5.4) and saturated (~3) rates — snowy days are usually near-saturated. */
export const LAPSE_F_PER_KFT = 3.3;
/** Rain→snow transition depth: all rain at snowLevel − half of this, all snow at snowLevel + half. */
const TRANSITION_FT = 1000;
/** Rule of thumb: snow reaches the ground ~1,000 ft below the freezing level (melting takes a while). */
const FREEZING_TO_SNOW_LEVEL_FT = 1000;
const MIN_SLR = 6;
const MAX_SLR = 18;
/** NWS-vs-our-model ratio correction is kept inside these bounds so a quirky period can't blow up the result. */
const MIN_ANCHOR = 0.5;
const MAX_ANCHOR = 2;
const MIN_PRECIP_MULT = 0.5;
const MAX_PRECIP_MULT = 2;
/** Anything this warm is rain regardless of what the snow level says. */
const ALWAYS_RAIN_F = 40;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function temperatureAt(tempF: number, fromFt: number, toFt: number): number {
  return tempF - (LAPSE_F_PER_KFT * (toFt - fromFt)) / 1000;
}

/** Snow-to-liquid ratio from air temp (Kuchera's curve, applied to surface temp — mountain points sit near the warm layer). */
export function snowLiquidRatio(tempF: number): number {
  const c = ((tempF - 32) * 5) / 9;
  const slr = c > -2 ? 12 + 2 * (-2 - c) : 12 + (-2 - c);
  return clamp(slr, MIN_SLR, MAX_SLR);
}

export function snowFraction(elevationFt: number, snowLevelFt: number, tempF: number): number {
  if (tempF >= ALWAYS_RAIN_F) return 0;
  return clamp((elevationFt - snowLevelFt) / TRANSITION_FT + 0.5, 0, 1);
}

/** Inches of snow per inch of liquid at an elevation: rain/snow split × ratio. */
function modelRatio(elevationFt: number, snowLevelFt: number | null, tempF: number): number {
  // No snow level forecast: fall back to temperature alone (≤32°F snow, ≥36°F rain).
  const frac = snowLevelFt != null ? snowFraction(elevationFt, snowLevelFt, tempF) : clamp((36 - tempF) / 4, 0, 1);
  return frac * snowLiquidRatio(tempF);
}

export function precipMultiplier(perKft: number, fromFt: number, toFt: number): number {
  return clamp((1 + perKft) ** ((toFt - fromFt) / 1000), MIN_PRECIP_MULT, MAX_PRECIP_MULT);
}

/**
 * Snow ratio at the target for one NWS period, anchored to NWS: our model
 * says how the ratio *changes* from the grid elevation to the target, NWS
 * says what it *is* at the grid elevation.
 */
export function anchoredNwsRatio(p: NwsPrecipPeriod, gridFt: number, targetFt: number, fallbackTempF: number): number {
  const refTemp = p.tempF ?? fallbackTempF;
  const tgtTemp = temperatureAt(refTemp, gridFt, targetFt);
  const mRef = modelRatio(gridFt, p.snowLevelFt, refTemp);
  const mTgt = modelRatio(targetFt, p.snowLevelFt, tgtTemp);
  if (p.snowIn == null || p.qpfIn <= 0) return mTgt;
  const rNws = p.snowIn / p.qpfIn;
  // NWS says all rain at the grid cell: only show snow where our model has
  // it *more* snowy than at the grid cell — zero at the grid elevation,
  // growing (continuously) above it.
  if (rNws === 0) return Math.max(0, mTgt - mRef);
  return mTgt * clamp(rNws / Math.max(mRef, 1), MIN_ANCHOR, MAX_ANCHOR);
}

const HOUR_MS = 3600_000;

/** One hour of the elevation-adjusted forecast. `time` is the Open-Meteo hour (local wall clock, hour *ending* then). */
export interface ElevationAdjustedHour {
  time: string;
  tempF: number;
  precipIn: number;
  snowIn: number;
  source: "nws" | "open-meteo";
}

/**
 * The model, hour by hour, at `targetFt`. Daily figures (below) are sums of
 * these, so the hourly chart and the daily views always agree.
 *
 * NWS QPF arrives in ~6-hour periods. Each period's total is spread over its
 * hours half evenly and half following Open-Meteo's hourly precip shape
 * (all evenly if Open-Meteo has none), so the hourly bars keep a realistic
 * onset and peak while the totals stay NWS's.
 */
export function computeElevationHourly(inputs: ElevationModelInputs, targetFt: number): ElevationAdjustedHour[] {
  const { utcOffsetSeconds, openMeteo, nws, gradient } = inputs;
  const offsetMs = utcOffsetSeconds * 1000;
  const hours = openMeteo.hourly.map((h) => ({
    time: h.time,
    endMs: Date.parse(`${h.time}Z`) - offsetMs,
    raw: h,
    tempF: temperatureAt(h.temperatureF, openMeteo.refElevationFt, targetFt),
    precipIn: 0,
    snowIn: 0,
    source: "open-meteo" as "nws" | "open-meteo",
  }));
  const byEnd = new Map(hours.map((h) => [h.endMs, h]));

  // NWS where it covers the hour.
  if (nws) {
    const mult = precipMultiplier(gradient.perKft, nws.gridElevationFt, targetFt);
    for (const p of nws.periods) {
      if (p.hours <= 0) continue;
      const slots = Array.from({ length: p.hours }, (_, i) => byEnd.get(p.startMs + (i + 1) * HOUR_MS));
      for (const h of slots) if (h) h.source = "nws";
      const fallbackTemp = hours.find((h) => h.endMs >= p.startMs)?.raw.temperatureF ?? 30;
      const precip = p.qpfIn * mult;
      const ratio = anchoredNwsRatio(p, nws.gridElevationFt, targetFt, fallbackTemp);
      const weights = slots.map((h) => Math.max(0, h?.raw.precipitationIn ?? 0));
      const total = weights.reduce((a, b) => a + b, 0);
      slots.forEach((h, i) => {
        if (!h) return; // outside the Open-Meteo hour grid
        // Half even, half Open-Meteo's shape: keeps the timing without piling a
        // whole 6-hour NWS total into the one hour Open-Meteo happens to peak.
        const share = total > 0 ? 0.5 / p.hours + (0.5 * weights[i]) / total : 1 / p.hours;
        h.precipIn += precip * share;
        h.snowIn += precip * share * ratio;
      });
    }
  }

  // Open-Meteo for every hour NWS doesn't cover.
  const omMult = precipMultiplier(gradient.perKft, openMeteo.refElevationFt, targetFt);
  for (const h of hours) {
    if (h.source === "nws" || h.raw.precipitationIn <= 0) continue;
    const precip = h.raw.precipitationIn * omMult;
    h.precipIn = precip;
    h.snowIn = precip * modelRatio(targetFt, h.raw.freezingLevelFt - FREEZING_TO_SNOW_LEVEL_FT, h.tempF);
  }

  return hours.map(({ time, tempF, precipIn, snowIn, source }) => ({ time, tempF, precipIn, snowIn, source }));
}

export function computeElevationForecast(inputs: ElevationModelInputs, targetFt: number): ElevationAdjustedDay[] {
  return dailyFromHourly(computeElevationHourly(inputs, targetFt));
}

/** Rolls hours up into days. Open-Meteo hourly values are totals for the hour *ending* at `time`, and its own daily sums bucket them by that timestamp's date, so this does too. */
export function dailyFromHourly(hours: ElevationAdjustedHour[]): ElevationAdjustedDay[] {
  const days = new Map<string, { tMax: number; tMin: number; precip: number; snow: number; nwsHours: number; omHours: number }>();
  for (const h of hours) {
    const date = h.time.slice(0, 10);
    let d = days.get(date);
    if (!d) days.set(date, (d = { tMax: -Infinity, tMin: Infinity, precip: 0, snow: 0, nwsHours: 0, omHours: 0 }));
    d.tMax = Math.max(d.tMax, h.tempF);
    d.tMin = Math.min(d.tMin, h.tempF);
    d.precip += h.precipIn;
    d.snow += h.snowIn;
    if (h.source === "nws") d.nwsHours++;
    else d.omHours++;
  }
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({
      date,
      tempMaxF: d.tMax,
      tempMinF: d.tMin,
      precipitationSumIn: d.precip,
      snowfallSumIn: d.snow,
      precipSource: d.nwsHours === 0 ? "open-meteo" : d.omHours === 0 ? "nws" : "mixed",
    }));
}

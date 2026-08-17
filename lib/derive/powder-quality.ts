// FC-07: qualitative read on new-snow density. No free API gives this
// directly (it's part of OpenSnow's proprietary PEAKS output) — this is a
// standard temperature-based snow-to-liquid ratio heuristic (in the
// spirit of Cobb's Rule), not a measurement. Always label it as an
// estimate in the UI.

import type { HourlyForecastPoint } from "@/lib/models/types";

export type PowderQuality = "Champagne" | "Light & Dry" | "Average" | "Dense" | "Wet/Heavy";

export interface PowderQualityEstimate {
  quality: PowderQuality;
  estimatedRatio: number; // e.g. 15 means "15:1" snow-to-liquid
}

export function estimatePowderQuality(temperatureF: number): PowderQualityEstimate {
  if (temperatureF > 32) return { quality: "Wet/Heavy", estimatedRatio: 6 };
  if (temperatureF > 27) return { quality: "Dense", estimatedRatio: 10 };
  if (temperatureF > 20) return { quality: "Average", estimatedRatio: 15 };
  if (temperatureF > 10) return { quality: "Light & Dry", estimatedRatio: 20 };
  return { quality: "Champagne", estimatedRatio: 30 };
}

/** Snowfall-weighted average quality across a day's hourly forecast. */
export function estimateDailyPowderQuality(
  hoursInDay: HourlyForecastPoint[]
): PowderQualityEstimate | null {
  const snowingHours = hoursInDay.filter((h) => h.snowfallIn > 0);
  if (snowingHours.length === 0) return null;

  const totalSnow = snowingHours.reduce((sum, h) => sum + h.snowfallIn, 0);
  const weightedTemp =
    snowingHours.reduce((sum, h) => sum + h.temperatureF * h.snowfallIn, 0) / totalSnow;

  return estimatePowderQuality(weightedTemp);
}

// SNOW-02: rough estimated trail conditions. No free feed reports actual
// groomed/powder/icy state (that's resort-reported, proprietary data) —
// this is a heuristic from recent snowfall timing and freeze-thaw cycles,
// always labeled as an estimate.

export type TrailConditionsLabel =
  | "Fresh snow"
  | "Soft / recently groomed likely"
  | "Variable — refrozen or icy possible"
  | "Spring conditions likely"
  | "Firm, groomer-dependent";

export interface TrailConditionsEstimate {
  label: TrailConditionsLabel;
  detail: string;
}

export function estimateTrailConditions(
  window: { time: string; temperatureF: number; snowfallIn: number }[]
): TrailConditionsEstimate | null {
  if (window.length === 0) return null;

  const now = new Date(window[window.length - 1].time).getTime();
  const lastSnowHour = [...window].reverse().find((h) => h.snowfallIn > 0);
  const hoursSinceSnow = lastSnowHour
    ? Math.round((now - new Date(lastSnowHour.time).getTime()) / 3_600_000)
    : null;

  let freezeThawCycles = 0;
  for (let i = 1; i < window.length; i++) {
    const prevAbove = window[i - 1].temperatureF > 32;
    const currAbove = window[i].temperatureF > 32;
    if (prevAbove !== currAbove) freezeThawCycles++;
  }

  const avgTemp = window.reduce((sum, h) => sum + h.temperatureF, 0) / window.length;

  if (hoursSinceSnow != null && hoursSinceSnow <= 6) {
    return { label: "Fresh snow", detail: `New snow within the last ${hoursSinceSnow}h.` };
  }
  if (hoursSinceSnow != null && hoursSinceSnow <= 24 && freezeThawCycles <= 1) {
    return { label: "Soft / recently groomed likely", detail: `Last snow ~${hoursSinceSnow}h ago, minimal freeze-thaw since.` };
  }
  if (freezeThawCycles >= 2) {
    return {
      label: "Variable — refrozen or icy possible",
      detail: `${freezeThawCycles} freeze-thaw crossings in the last ${window.length}h — expect firm or icy spots, especially mornings.`,
    };
  }
  if (avgTemp > 40) {
    return { label: "Spring conditions likely", detail: `Average temp ${avgTemp.toFixed(0)}°F — soft/slushy by afternoon.` };
  }
  return { label: "Firm, groomer-dependent", detail: "No recent new snow or major freeze-thaw swings detected." };
}

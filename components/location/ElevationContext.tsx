"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { ElevationAdjustedDay, ElevationModelInputs, Location } from "@/lib/models/types";
import { computeElevationHourly, dailyFromHourly, type ElevationAdjustedHour } from "@/lib/derive/elevation-snow";

// One elevation choice for the whole location page. The Snow Summary, the
// "Today's new snow" tile, the 14-day table and the 24-hour chart all read
// their forecast from here, so moving either slider moves every number
// together.
//
// Snow comes from lib/derive/elevation-snow.ts at every position — the
// base elevation included — so the numbers agree with each other before
// the slider is touched, too. Its inputs ship with the page, so changes
// recompute instantly in the browser.

const PIN_RANGE_FT = 3000;

interface ElevationState {
  selected: number;
  setSelected: (ft: number) => void;
  min: number;
  max: number;
  baseFt: number | null;
  /** True when the slider is away from the location's own elevation. */
  isAdjusted: boolean;
  /** Elevation-modeled days by date; null when the model is unavailable (callers fall back to the raw forecast). */
  modeledByDate: Map<string, ElevationAdjustedDay> | null;
  /** Elevation-modeled hours by local time string (same keys as the hourly forecast); null when unavailable. */
  modeledByHour: Map<string, ElevationAdjustedHour> | null;
}

const Ctx = createContext<ElevationState | null>(null);

function bounds(location: Location, elevationFt: number | null) {
  if (location.minElevationFt != null && location.maxElevationFt != null) {
    return { min: location.minElevationFt, max: location.maxElevationFt };
  }
  const center = elevationFt ?? 6000;
  return { min: Math.max(0, center - PIN_RANGE_FT), max: center + PIN_RANGE_FT };
}

export function ElevationProvider({
  location,
  elevationFt,
  elevationModel,
  children,
}: {
  location: Location;
  elevationFt: number | null;
  elevationModel: ElevationModelInputs | null;
  children: ReactNode;
}) {
  const { min, max } = bounds(location, elevationFt);
  const [selected, setSelected] = useState(elevationFt ?? Math.round((min + max) / 2));
  // One model run per slider position, hourly; days are sums of the hours, so every view agrees.
  const { modeledByDate, modeledByHour } = useMemo(() => {
    if (!elevationModel) return { modeledByDate: null, modeledByHour: null };
    const hours = computeElevationHourly(elevationModel, selected);
    return {
      modeledByHour: new Map(hours.map((h) => [h.time, h])),
      modeledByDate: new Map(dailyFromHourly(hours).map((d) => [d.date, d])),
    };
  }, [elevationModel, selected]);
  const value = useMemo<ElevationState>(
    () => ({
      selected,
      setSelected,
      min,
      max,
      baseFt: elevationFt,
      isAdjusted: elevationFt == null || selected !== elevationFt,
      modeledByDate,
      modeledByHour,
    }),
    [selected, min, max, elevationFt, modeledByDate, modeledByHour]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useElevation(): ElevationState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useElevation must be used inside <ElevationProvider>");
  return v;
}

/** Modeled snow for a date at the selected elevation, else the raw value. */
export function useSnowAt() {
  const { modeledByDate } = useElevation();
  return (date: string, rawIn: number) => modeledByDate?.get(date)?.snowfallSumIn ?? rawIn;
}

export function ElevationSlider({ compact = false }: { compact?: boolean }) {
  const { selected, setSelected, min, max, baseFt, isAdjusted, modeledByDate } = useElevation();
  return (
    <div className={compact ? "" : "mb-4"}>
      {compact && (
        <div className="mb-1 flex items-baseline justify-between text-xs">
          <span className="font-medium text-muted-foreground">Forecast elevation</span>
          <span className="font-semibold">
            {selected.toLocaleString()} ft
            {isAdjusted && baseFt != null && (
              <button type="button" onClick={() => setSelected(baseFt)} className="ml-2 font-medium text-primary hover:underline">
                Reset
              </button>
            )}
          </span>
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={50}
        value={selected}
        onChange={(e) => setSelected(Number(e.target.value))}
        disabled={!modeledByDate}
        className="w-full accent-primary disabled:opacity-40"
        aria-label="Forecast elevation (feet)"
      />
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>{min.toLocaleString()} ft</span>
        {!compact && (
          <span className="font-semibold text-foreground">
            {selected.toLocaleString()} ft
            {isAdjusted && baseFt != null && (
              <span className="ml-1 font-normal text-muted-foreground">
                ({selected > baseFt ? "+" : ""}
                {(selected - baseFt).toLocaleString()} ft vs. {baseFt.toLocaleString()} ft base)
              </span>
            )}
          </span>
        )}
        <span>{max.toLocaleString()} ft</span>
      </div>
    </div>
  );
}

/** "Today's new snow" stat tile, tied to the slider. */
export function TodaySnowTile({ date, rawIn }: { date: string | undefined; rawIn: number }) {
  const { selected, isAdjusted, modeledByDate } = useElevation();
  const snowAt = useSnowAt();
  const v = date ? snowAt(date, rawIn) : rawIn;
  return (
    <div className="stat-tile">
      <div className="text-xs text-muted-foreground">Today&apos;s new snow</div>
      <div className={`text-lg font-bold tracking-tight ${isAdjusted && modeledByDate ? "text-primary" : ""}`}>{v.toFixed(1)}&quot;</div>
      {isAdjusted && modeledByDate && <div className="text-xs text-muted-foreground">at {selected.toLocaleString()} ft</div>}
    </div>
  );
}

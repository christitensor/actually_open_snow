"use client";

import { useEffect, useRef, useState } from "react";
import type { ElevationAdjustedDay, Location } from "@/lib/models/types";

// FC-10-adj: lets the user drag an elevation slider and see today's
// temp/precip/snow recalculated for that elevation — backed by
// Open-Meteo's `elevation` override param (live-verified: it downscales
// both temperature and precipitation, not just temperature via a fixed
// lapse rate). Debounced so dragging doesn't spam the API.
const DEBOUNCE_MS = 400;
const PIN_RANGE_FT = 3000;

function bounds(location: Location, elevationFt: number | null): { min: number; max: number } {
  if (location.minElevationFt != null && location.maxElevationFt != null) {
    return { min: location.minElevationFt, max: location.maxElevationFt };
  }
  const center = elevationFt ?? 6000;
  return { min: Math.max(0, center - PIN_RANGE_FT), max: center + PIN_RANGE_FT };
}

interface FetchedResult {
  forElevationFt: number;
  days: ElevationAdjustedDay[];
}

export default function ElevationAdjuster({
  location,
  elevationFt,
  baselineToday,
}: {
  location: Location;
  elevationFt: number | null;
  baselineToday: { tempMaxF: number; tempMinF: number; precipitationSumIn: number; snowfallSumIn: number };
}) {
  const { min, max } = bounds(location, elevationFt);
  const [selected, setSelected] = useState(elevationFt ?? Math.round((min + max) / 2));
  const [result, setResult] = useState<FetchedResult | null>(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isAdjusted = selected !== elevationFt;

  useEffect(() => {
    if (!isAdjusted) return; // baseline elevation — render falls back to the unmodified forecast, nothing to fetch
    clearTimeout(debounceRef.current);
    // setLoading/setResult both live inside this timeout callback (not the
    // effect body itself) so they fire in response to the timer, not
    // synchronously during the effect — the pattern react-hooks/set-state
    // -in-effect expects for "subscribe to an external event" style updates.
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/forecast-elevation?lat=${location.lat}&lon=${location.lon}&elevationFt=${selected}`);
        if (res.ok) {
          const body = (await res.json()) as { daily: ElevationAdjustedDay[] };
          setResult({ forElevationFt: selected, days: body.daily });
        }
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [isAdjusted, selected, location.lat, location.lon]);

  const today = isAdjusted && result?.forElevationFt === selected ? result.days[0] : undefined;
  const showLoading = isAdjusted && !today && loading;

  return (
    <section className="card p-4">
      <h2 className="mb-1 font-bold tracking-tight">🏔️ Elevation adjuster</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Drag to see today&apos;s forecast recalculated for a different elevation on this mountain.
      </p>
      <input
        type="range"
        min={min}
        max={max}
        step={50}
        value={selected}
        onChange={(e) => setSelected(Number(e.target.value))}
        className="w-full accent-primary"
        aria-label="Elevation (feet)"
      />
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>{min.toLocaleString()} ft</span>
        <span className="font-semibold text-foreground">{selected.toLocaleString()} ft</span>
        <span>{max.toLocaleString()} ft</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="High / Low"
          value={today ? `${Math.round(today.tempMaxF)}° / ${Math.round(today.tempMinF)}°` : showLoading ? "…" : `${Math.round(baselineToday.tempMaxF)}° / ${Math.round(baselineToday.tempMinF)}°`}
        />
        <StatTile label="New snow" value={today ? `${today.snowfallSumIn.toFixed(1)}"` : showLoading ? "…" : `${baselineToday.snowfallSumIn.toFixed(1)}"`} />
        <StatTile label="Precip (liquid)" value={today ? `${today.precipitationSumIn.toFixed(2)}"` : showLoading ? "…" : `${baselineToday.precipitationSumIn.toFixed(2)}"`} />
        <StatTile
          label="vs. base elevation"
          value={!isAdjusted ? "No change" : `${selected > (elevationFt ?? selected) ? "+" : ""}${(selected - (elevationFt ?? selected)).toLocaleString()} ft`}
        />
      </div>
    </section>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

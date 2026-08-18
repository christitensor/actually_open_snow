"use client";

import { useEffect, useRef, useState } from "react";
import type { DailyForecastDay, DailySnowLine, ElevationAdjustedDay, Location } from "@/lib/models/types";
import { degToCompass } from "@/lib/util/wind";

// FC-10 + FC-10-adj, merged: the 14-day forecast table and the elevation
// slider used to be two separate sections (a static table, and a small
// "today only" preview card below it). Merged so dragging the slider
// recalculates the High/Low, New snow, and Precip columns for the whole
// visible forecast, not just today — that's the point of a multi-day
// table: seeing how a storm plays out at a different elevation across the
// week, not just right now.
//
// Snow line and Wind are left showing the actual (base-elevation)
// forecast even while adjusted: Open-Meteo's `elevation` override
// downscales temperature/precipitation for a specific point (verified
// live), but doesn't give us a wind or freezing-level forecast at that
// same point — those describe the storm system as a whole, not a spot
// elevation, so there's nothing meaningful to recompute for them.

const FORECAST_DISPLAY_DAYS = 14;
const DEBOUNCE_MS = 400;
const PIN_RANGE_FT = 3000;

function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function bounds(location: Location, elevationFt: number | null): { min: number; max: number } {
  if (location.minElevationFt != null && location.maxElevationFt != null) {
    return { min: location.minElevationFt, max: location.maxElevationFt };
  }
  const center = elevationFt ?? 6000;
  return { min: Math.max(0, center - PIN_RANGE_FT), max: center + PIN_RANGE_FT };
}

interface FetchedResult {
  forElevationFt: number;
  byDate: Map<string, ElevationAdjustedDay>;
}

export default function ForecastTable({
  location,
  elevationFt,
  dailyForecast,
  dailySnowLines,
}: {
  location: Location;
  elevationFt: number | null;
  dailyForecast: DailyForecastDay[];
  dailySnowLines: DailySnowLine[];
}) {
  const { min, max } = bounds(location, elevationFt);
  const [selected, setSelected] = useState(elevationFt ?? Math.round((min + max) / 2));
  const [result, setResult] = useState<FetchedResult | null>(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isAdjusted = selected !== elevationFt;

  useEffect(() => {
    if (!isAdjusted) return; // baseline elevation — table already shows the unmodified forecast
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/forecast-elevation?lat=${location.lat}&lon=${location.lon}&elevationFt=${selected}`);
        if (res.ok) {
          const body = (await res.json()) as { daily: ElevationAdjustedDay[] };
          setResult({ forElevationFt: selected, byDate: new Map(body.daily.map((d) => [d.date, d])) });
        }
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [isAdjusted, selected, location.lat, location.lon]);

  const adjustedByDate = isAdjusted && result?.forElevationFt === selected ? result.byDate : null;
  const days = dailyForecast.slice(0, FORECAST_DISPLAY_DAYS);

  return (
    <section className="card p-4">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="font-bold tracking-tight">{FORECAST_DISPLAY_DAYS}-day forecast</h2>
        {adjustedByDate && (
          <span className="pill bg-primary/10 text-primary">
            At {selected.toLocaleString()} ft{loading ? " · updating…" : ""}
          </span>
        )}
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Days 8+ are lower-confidence trend guidance from Open-Meteo&apos;s model blend, not a precise day-by-day call —
        treat them as a heads-up on pattern changes, not a packing list.
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
      <div className="mb-4 mt-1 flex justify-between text-xs text-muted-foreground">
        <span>{min.toLocaleString()} ft</span>
        <span className="font-semibold text-foreground">
          {selected.toLocaleString()} ft
          {isAdjusted && elevationFt != null && (
            <span className="ml-1 font-normal text-muted-foreground">
              ({selected > elevationFt ? "+" : ""}
              {(selected - elevationFt).toLocaleString()} ft vs. {elevationFt.toLocaleString()} ft base)
            </span>
          )}
        </span>
        <span>{max.toLocaleString()} ft</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="sticky left-0 z-10 border-r border-border bg-card py-1 pr-4 font-medium">Day</th>
              <th className="py-1 pr-4 pl-4 font-medium">High / Low</th>
              <th className="py-1 pr-4 font-medium">New snow</th>
              <th className="py-1 pr-4 font-medium">Precip (liquid)</th>
              <th className="py-1 pr-4 font-medium">Snow line</th>
              <th className="py-1 font-medium">Wind</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d, i) => {
              const snowLine = dailySnowLines[i];
              const adjusted = adjustedByDate?.get(d.date);
              const row = adjusted ?? d;
              return (
                <tr key={d.date} className={`border-t border-border ${i >= 7 ? "text-muted-foreground" : ""}`}>
                  <td className="sticky left-0 z-10 border-r border-border bg-card py-1.5 pr-4 font-medium">{fmtDate(d.date)}</td>
                  <td className={`py-1.5 pr-4 pl-4 ${adjusted ? "font-semibold text-primary" : ""}`}>
                    {Math.round(row.tempMaxF)}° / {Math.round(row.tempMinF)}°
                  </td>
                  <td className={`py-1.5 pr-4 ${adjusted ? "font-semibold text-primary" : ""}`}>
                    {row.snowfallSumIn > 0 ? `${row.snowfallSumIn.toFixed(1)}"` : "—"}
                  </td>
                  <td className={`py-1.5 pr-4 ${adjusted ? "font-semibold text-primary" : ""}`}>{row.precipitationSumIn.toFixed(2)}&quot;</td>
                  <td className="py-1.5 pr-4">{snowLine?.snowLineFt != null ? `${snowLine.snowLineFt.toLocaleString()} ft` : "—"}</td>
                  <td className="py-1.5">
                    {Math.round(d.windSpeedMaxMph)}
                    {d.windGustMaxMph > d.windSpeedMaxMph + 3 ? ` G${Math.round(d.windGustMaxMph)}` : ""} mph {degToCompass(d.windDirectionDominantDeg)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Snow line is an afternoon estimate — {dailySnowLines.some((d) => d.source === "nws") ? "NWS gridpoint forecast where available, Open-Meteo freezing level beyond its ~7-day range." : "Open-Meteo freezing level (no NWS coverage for this point)."}
        {" "}Precip (liquid) is total rain+snow water content for the day — it&apos;s not snow depth and includes rain, so it won&apos;t match New snow on warm days. New snow is Open-Meteo&apos;s own modeled snow accumulation, already converted from liquid using a temperature-based ratio (not a flat 10:1).
        {adjustedByDate && " High/Low, New snow, and Precip (blue) are recalculated for the elevation above; Snow line and Wind describe the storm as a whole and don't change with the slider."}
      </p>
    </section>
  );
}

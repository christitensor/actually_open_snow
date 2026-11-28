"use client";

import { Fragment, useState } from "react";
import type { DailyForecastDay, DailySnowLine, ElevationModelInputs, HourlyForecastPoint } from "@/lib/models/types";
import { splitDayNightSnow, type DayNightSplit } from "@/lib/derive/day-night";
import { estimateDailyPowderQuality, type PowderQualityEstimate } from "@/lib/derive/powder-quality";
import { ElevationSlider, useElevation } from "@/components/location/ElevationContext";
import { degToCompass } from "@/lib/util/wind";
import { describeWeather } from "@/lib/util/weather-code";
import Section from "@/components/ui/Section";

// FC-10 + FC-10-adj: the 14-day forecast table, with an elevation slider
// that recalculates High/Low, New snow, and Precip for the whole forecast.
// The elevation is shared page-wide (ElevationContext), so the Snow
// Summary and today's-snow tile move with it.
//
// Those three columns come from lib/derive/elevation-snow.ts at every
// slider position, including the base: NWS gridpoint precip/snow for days
// ~1-7 (Open-Meteo after), adjusted for elevation with a SNOTEL-calibrated
// precip gradient and a temperature-dependent snow ratio. The model's
// inputs ship with the page, so the slider recomputes instantly in the
// browser — no request per drag (the old version refetched Open-Meteo on
// every move and still came out nearly flat above the snow line).
//
// Snow line and Wind describe the storm as a whole, not a spot
// elevation, so they don't change with the slider.
//
// FC-13 (issue #28) + FC-07 per-day (issue #26): tapping a day expands a
// detail row with the overnight (5pm-8am) vs. daytime (8am-5pm) split of
// that ski day's snow, from the raw hourly model (lib/derive/day-night.ts),
// plus the day's powder-quality estimate under its New snow figure. The
// split is deliberately NOT rescaled to the elevation-adjusted daily
// total — the parts describe when the snow falls, the headline number
// describes how much at the selected elevation.

const FORECAST_DISPLAY_DAYS = 14;

function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

const pct = (x: number) => `${(x * 100).toFixed(x * 100 >= 10 ? 0 : 1)}%`;

export default function ForecastTable({
  dailyForecast,
  dailySnowLines,
  elevationModel,
  hourly,
}: {
  dailyForecast: DailyForecastDay[];
  dailySnowLines: DailySnowLine[];
  elevationModel: ElevationModelInputs | null;
  hourly: HourlyForecastPoint[];
}) {
  const { selected, isAdjusted, modeledByDate } = useElevation();
  const days = dailyForecast.slice(0, FORECAST_DISPLAY_DAYS);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  // Cheap enough to compute per render (14 days x ~400 hourly points).
  const splits = new Map(days.map((d) => [d.date, splitDayNightSnow(hourly, d.date)]));
  const qualities = new Map(
    days.map((d) => [d.date, estimateDailyPowderQuality(hourly.filter((h) => h.time.startsWith(d.date)))])
  );
  const nwsDays = modeledByDate ? days.filter((d) => modeledByDate.get(d.date)?.precipSource !== "open-meteo").length : 0;
  const gradient = elevationModel?.gradient;
  const highlight = modeledByDate != null && isAdjusted;
  const weekSnow = days.slice(0, 7).reduce((s, d) => s + (modeledByDate?.get(d.date)?.snowfallSumIn ?? d.snowfallSumIn), 0);
  const nextSnowDay = days.find((d) => (modeledByDate?.get(d.date)?.snowfallSumIn ?? d.snowfallSumIn) >= 1);

  return (
    <Section
      id="daily-forecast"
      title={`${FORECAST_DISPLAY_DAYS}-day forecast`}
      meta={highlight ? <span className="pill bg-primary/10 text-primary">At {selected.toLocaleString()} ft</span> : undefined}
      summary={`${weekSnow.toFixed(1)}" over the next 7 days${nextSnowDay ? ` · next 1"+ day: ${nextSnowDay === days[0] ? "today" : fmtDate(nextSnowDay.date)}` : ""}`}
    >
      <p className="mb-3 text-xs text-muted-foreground">
        Days 8+ are lower-confidence trend guidance from Open-Meteo&apos;s model blend, not a precise day-by-day call —
        treat them as a heads-up on pattern changes, not a packing list. Tap any day for its overnight vs. daytime
        snow split and snow quality.
      </p>

      <ElevationSlider />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[780px] text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="sticky left-0 z-10 border-r border-border bg-card py-1 pr-4 font-medium">Day</th>
              <th className="py-1 pr-4 pl-4 font-medium">Sky</th>
              <th className="py-1 pr-4 font-medium">High / Low</th>
              <th className="py-1 pr-4 font-medium">New snow</th>
              <th className="py-1 pr-4 font-medium">Precip (liquid)</th>
              <th className="py-1 pr-4 font-medium">Snow line</th>
              <th className="py-1 font-medium">Wind</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d, i) => {
              const snowLine = dailySnowLines[i];
              const modeled = modeledByDate?.get(d.date);
              const row = modeled ?? d;
              const adjusted = highlight && modeled != null;
              const quality = qualities.get(d.date) ?? null;
              const expanded = expandedDate === d.date;
              return (
                <Fragment key={d.date}>
                  <tr
                    className={`cursor-pointer border-t border-border hover:bg-muted/40 ${i >= 7 ? "text-muted-foreground" : ""} ${expanded ? "bg-muted/40" : ""}`}
                    onClick={() => setExpandedDate(expanded ? null : d.date)}
                    aria-expanded={expanded}
                    title="Tap for overnight vs. daytime split"
                  >
                    <td className="sticky left-0 z-10 border-r border-border bg-card py-1.5 pr-4 font-medium">
                      {fmtDate(d.date)}{" "}
                      <span className="text-[10px] text-muted-foreground" aria-hidden="true">
                        {expanded ? "▾" : "▸"}
                      </span>
                    </td>
                    <td className="py-1.5 pr-4 pl-4">
                      <SkyCell day={d} />
                    </td>
                    <td className={`py-1.5 pr-4 ${adjusted ? "font-semibold text-primary" : ""}`}>
                      {Math.round(row.tempMaxF)}° / {Math.round(row.tempMinF)}°
                    </td>
                    <td className={`py-1.5 pr-4 ${adjusted ? "font-semibold text-primary" : ""}`}>
                      {row.snowfallSumIn > 0 ? `${row.snowfallSumIn.toFixed(1)}"` : "—"}
                      {quality && row.snowfallSumIn > 0 && (
                        <div className="text-[11px] font-normal text-muted-foreground">{quality.quality}</div>
                      )}
                    </td>
                    <td className={`py-1.5 pr-4 ${adjusted ? "font-semibold text-primary" : ""}`}>{row.precipitationSumIn.toFixed(2)}&quot;</td>
                    <td className="py-1.5 pr-4">{snowLine?.snowLineFt != null ? `${snowLine.snowLineFt.toLocaleString()} ft` : "—"}</td>
                    <td className="py-1.5">
                      {Math.round(d.windSpeedMaxMph)}
                      {d.windGustMaxMph > d.windSpeedMaxMph + 3 ? ` G${Math.round(d.windGustMaxMph)}` : ""} mph {degToCompass(d.windDirectionDominantDeg)}
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="border-t border-border/50 bg-muted/30">
                      <td colSpan={7} className="py-3 pr-4 pl-4">
                        <DayDetail split={splits.get(d.date) ?? { overnightIn: 0, daytimeIn: 0 }} quality={quality} isToday={i === 0} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
        <p>
          {modeledByDate ? (
            <>
              New snow and Precip use the{" "}
              {nwsDays > 0 ? `NWS (NOAA) gridpoint forecast for the first ${nwsDays} days and Open-Meteo after` : "Open-Meteo forecast (no NWS coverage here)"}, adjusted to the
              elevation above: precip grows <strong>{gradient ? pct(gradient.perKft) : "—"} per 1,000 ft</strong>
              {gradient?.source === "snotel"
                ? ` (fitted to ${gradient.stationCount} nearby SNOTEL gauges' 10-year water-year totals${gradient.r2 != null && gradient.r2 < 0.5 ? ", blended with a 7% default since elevation explains only part of the station-to-station difference" : ""})`
                : " (default; not enough nearby SNOTEL gauges to calibrate)"}
              , and snow gets fluffier as it gets colder (≈8:1 near freezing up to 18:1 in cold storms) instead of a flat ratio.
              {elevationModel?.nws ? ` At the NWS grid cell's own elevation (${elevationModel.nws.gridElevationFt.toLocaleString()} ft) it matches NWS's snowfall forecast.` : ""}
            </>
          ) : (
            "Elevation model unavailable right now — showing Open-Meteo's daily forecast for the base elevation, and the slider is disabled."
          )}
        </p>
        <p>
          Snow line is an afternoon estimate —{" "}
          {dailySnowLines.some((d) => d.source === "nws") ? "NWS gridpoint forecast where available, Open-Meteo freezing level beyond its ~7-day range." : "Open-Meteo freezing level (no NWS coverage for this point)."}{" "}
          Precip (liquid) is rain + snow water content, so it won&apos;t match New snow on warm days. Snow line and Wind describe the storm as a whole and
          don&apos;t change with the slider.
        </p>
        <p>
          In a day&apos;s detail: overnight is 5pm the day before through 8am — what&apos;s on the ground at first chair — and daytime is 8am–5pm, what
          falls while lifts spin. Snow quality under a day&apos;s New snow is FC-07&apos;s temperature-based estimate for that day.
        </p>
      </div>
    </Section>
  );
}

// FC-13: the expanded day detail — overnight vs. daytime split with a
// proportional bar, plus the day's powder-quality estimate. The split is
// from the raw hourly model (see lib/derive/day-night.ts), so its parts
// may not sum to the elevation-adjusted daily total in the row above;
// the caption says so rather than silently rescaling.
function DayDetail({
  split,
  quality,
  isToday,
}: {
  split: DayNightSplit;
  quality: PowderQualityEstimate | null;
  isToday: boolean;
}) {
  const total = split.overnightIn + split.daytimeIn;
  if (total <= 0.05) {
    return (
      <p className="text-xs text-muted-foreground">
        No snow in the hourly model for this ski day (5pm–5pm), so there&apos;s no overnight/daytime split to show.
      </p>
    );
  }
  const nightPct = Math.round((split.overnightIn / total) * 100);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
        <span>
          🌙 <strong>Overnight</strong>{" "}
          <span className="text-muted-foreground">{isToday ? "(midnight–8am)" : "(5pm–8am)"}</span>:{" "}
          <strong>{split.overnightIn.toFixed(1)}&quot;</strong>
        </span>
        <span>
          ☀️ <strong>Daytime</strong> <span className="text-muted-foreground">(8am–5pm)</span>:{" "}
          <strong>{split.daytimeIn.toFixed(1)}&quot;</strong>
        </span>
        {quality && (
          <span className="pill bg-primary/10 text-primary">
            Snow quality: {quality.quality} · ~{quality.estimatedRatio}:1 est.
          </span>
        )}
      </div>
      <div className="flex h-2 w-full max-w-md overflow-hidden rounded-full" aria-hidden="true">
        <div className="bg-blue-800 dark:bg-blue-600" style={{ width: `${nightPct}%` }} />
        <div className="bg-amber-400" style={{ width: `${100 - nightPct}%` }} />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Split from Open-Meteo&apos;s hourly model — it shows when the snow falls, so the parts may not sum to the
        elevation-adjusted daily total above.
        {isToday && " Today's overnight reaches back only to midnight; the hourly feed doesn't include yesterday evening."}
      </p>
    </div>
  );
}

// Icon + one-word sky, then the two numbers that answer "will it be nice
// out": highest precip chance and hours of direct sun.
function SkyCell({ day }: { day: DailyForecastDay }) {
  const w = describeWeather(day.weatherCode);
  const sun = day.sunshineHours;
  const chance = day.precipProbabilityMaxPct;
  return (
    <div className="flex items-center gap-2" title={day.cloudCoverMeanPct != null ? `${w.label} · ${day.cloudCoverMeanPct}% avg cloud cover` : w.label}>
      <span className="text-xl leading-none" role="img" aria-label={w.label}>
        {w.icon}
      </span>
      <div className="leading-tight">
        <div className="hidden whitespace-nowrap text-xs font-medium text-foreground sm:block">{w.label}</div>
        <div className="whitespace-nowrap text-[11px] text-muted-foreground tabular-nums">
          {chance != null && <span className={chance >= 60 ? "font-semibold text-primary" : ""}>☔{chance}%</span>}
          {chance != null && sun != null && " · "}
          {sun != null && <span>☀{Math.round(sun)}h</span>}
        </div>
      </div>
    </div>
  );
}

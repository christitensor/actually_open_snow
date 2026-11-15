import type { DailyForecastDay, HourlyForecastPoint } from "@/lib/models/types";
import { degToCompass } from "@/lib/util/wind";

// FC-02: the next-24-hours view as one aligned strip of small charts instead
// of a five-column table. Every row shares the same hour columns, so "when
// does it start snowing, how cold is it then, and is the wind going to shut
// the lifts" reads straight down a single column:
//
//   time · sky icon · temperature line · snow/rain bars · wind arrows
//
// Night hours are shaded behind every row (from each day's sunrise/sunset)
// and midnight gets a divider. The temperature line switches from orange to
// blue where it crosses 32°F, since freezing is the threshold that decides
// snow vs. rain. Exact numbers stay one tap away in the "View as table"
// fallback, which is also the screen-reader-friendly version.
//
// Layout: CSS grid columns that stretch to fill the card (min 36px each, so
// a phone scrolls sideways). The temperature line is an SVG stretched only
// horizontally (non-scaling stroke); dots and labels are HTML positioned in
// % / px so text never distorts.
//
// Hour strings are the location's local wall clock with no offset, so every
// label is read off the string itself rather than through Date in the
// server's timezone.

const COL_MIN_PX = 36;
const GUTTER_PX = 44;
const TEMP_ROW_PX = 92;
const TEMP_PAD_TOP_PX = 22;
const TEMP_PAD_BOTTOM_PX = 10;
const SNOW_ROW_PX = 64;
const SNOW_LABEL_PX = 14;
// Scale floors so a single 0.1" hour doesn't draw as a full-height bar.
const SNOW_SCALE_MIN_IN = 0.5;
const RAIN_SCALE_MIN_IN = 0.1;
const FREEZING_F = 32;
// Only stretch the temperature axis to include 32°F when it's nearby —
// otherwise a 5°F-wide cold day gets squashed into a flat line.
const FREEZING_PULL_IN_F = 8;
const WIND_WATCH_MPH = 25;
const WIND_HOLD_MPH = 40;

function hourLabel(time: string): string {
  const h = Number(time.slice(11, 13));
  if (h === 0) return "12a";
  if (h < 12) return `${h}a`;
  if (h === 12) return "12p";
  return `${h - 12}p`;
}

function weekday(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

function sunTime(iso: string): string {
  const h = Number(iso.slice(11, 13));
  const m = iso.slice(14, 16);
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? "AM" : "PM"}`;
}

// WMO weather interpretation codes (Open-Meteo `weather_code`).
function sky(code: number, night: boolean): { icon: string; label: string } {
  if (code === 0) return night ? { icon: "🌙", label: "Clear" } : { icon: "☀️", label: "Clear" };
  if (code === 1) return night ? { icon: "🌙", label: "Mostly clear" } : { icon: "🌤️", label: "Mostly clear" };
  if (code === 2) return night ? { icon: "☁️", label: "Partly cloudy" } : { icon: "⛅", label: "Partly cloudy" };
  if (code === 3) return { icon: "☁️", label: "Overcast" };
  if (code === 45 || code === 48) return { icon: "🌫️", label: "Fog" };
  if (code >= 51 && code <= 57) return { icon: "🌦️", label: "Drizzle" };
  if (code === 66 || code === 67) return { icon: "🧊", label: "Freezing rain" };
  if (code >= 61 && code <= 65) return { icon: "🌧️", label: "Rain" };
  if (code >= 71 && code <= 77) return { icon: "🌨️", label: "Snow" };
  if (code >= 80 && code <= 82) return { icon: "🌦️", label: "Rain showers" };
  if (code === 85 || code === 86) return { icon: "🌨️", label: "Snow showers" };
  if (code >= 95) return { icon: "⛈️", label: "Thunderstorm" };
  return { icon: "·", label: "Unknown" };
}

function inchesShort(x: number): string {
  if (x >= 10) return `${Math.round(x)}`;
  const s = x.toFixed(1);
  return s.startsWith("0") ? s.slice(1) : s;
}

function windTone(mph: number): string {
  if (mph >= WIND_HOLD_MPH) return "font-bold text-red-600 dark:text-red-400";
  if (mph >= WIND_WATCH_MPH) return "font-semibold text-amber-600 dark:text-amber-400";
  return "text-foreground";
}

interface Props {
  hours: HourlyForecastPoint[];
  daily: DailyForecastDay[];
}

export default function HourlyForecast({ hours, daily }: Props) {
  const n = hours.length;
  if (n === 0) return null;

  const dayByDate = new Map(daily.map((d) => [d.date, d]));
  const isNight = (time: string) => {
    const d = dayByDate.get(time.slice(0, 10));
    if (!d) return false;
    return time < d.sunrise || time >= d.sunset;
  };

  // ---- summary ---------------------------------------------------------
  const temps = hours.map((h) => h.temperatureF);
  const lo = Math.min(...temps);
  const hi = Math.max(...temps);
  const totalSnow = hours.reduce((s, h) => s + h.snowfallIn, 0);
  const totalLiquid = hours.reduce((s, h) => s + h.precipitationIn, 0);
  const snowyIdx = hours.flatMap((h, i) => (h.snowfallIn >= 0.05 ? [i] : []));
  const rainyHours = hours.filter((h) => h.snowfallIn < 0.05 && h.precipitationIn >= 0.01).length;
  const gustIdx = hours.reduce((best, h, i) => (Math.max(h.windGustMph, h.windSpeedMph) > Math.max(hours[best].windGustMph, hours[best].windSpeedMph) ? i : best), 0);
  const peakGust = Math.round(Math.max(hours[gustIdx].windGustMph, hours[gustIdx].windSpeedMph));
  const heaviestIdx = hours.reduce((best, h, i) => (h.snowfallIn > hours[best].snowfallIn ? i : best), 0);
  const timeName = (i: number) => (i === 0 ? "now" : hourLabel(hours[i].time));

  // ---- temperature geometry -------------------------------------------
  let tMin = lo;
  let tMax = hi;
  if (FREEZING_F < tMin && tMin - FREEZING_F <= FREEZING_PULL_IN_F) tMin = FREEZING_F;
  if (FREEZING_F > tMax && FREEZING_F - tMax <= FREEZING_PULL_IN_F) tMax = FREEZING_F;
  if (tMax - tMin < 6) {
    const mid = (tMax + tMin) / 2;
    tMin = mid - 3;
    tMax = mid + 3;
  }
  const plotH = TEMP_ROW_PX - TEMP_PAD_TOP_PX - TEMP_PAD_BOTTOM_PX;
  const yOf = (t: number) => TEMP_PAD_TOP_PX + (1 - (t - tMin) / (tMax - tMin)) * plotH;
  const VB_COL = 10; // SVG units per column; stretched horizontally to fit
  const xOf = (i: number) => (i + 0.5) * VB_COL;
  const linePath = hours.map((h, i) => `${i === 0 ? "M" : "L"}${xOf(i)},${yOf(h.temperatureF).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${xOf(n - 1)},${TEMP_ROW_PX} L${xOf(0)},${TEMP_ROW_PX} Z`;
  const freezingVisible = FREEZING_F >= tMin && FREEZING_F <= tMax;
  const freezingY = yOf(FREEZING_F);
  const freezingStop = Math.min(1, Math.max(0, freezingY / TEMP_ROW_PX));

  // ---- precip scale ----------------------------------------------------
  const snowScale = Math.max(SNOW_SCALE_MIN_IN, ...hours.map((h) => h.snowfallIn));
  const rainScale = Math.max(RAIN_SCALE_MIN_IN, ...hours.map((h) => h.precipitationIn));
  const barMaxPx = SNOW_ROW_PX - SNOW_LABEL_PX - 2;

  const cols = { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` };
  const sunDays = Array.from(new Set(hours.map((h) => h.time.slice(0, 10))))
    .map((date) => dayByDate.get(date))
    .filter((d): d is DailyForecastDay => d != null);

  const running = hours.map((_, i) => hours.slice(0, i + 1).reduce((s, h) => s + h.snowfallIn, 0));

  return (
    <section className="card p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="font-bold tracking-tight">Next {n} hours</h2>
        {sunDays.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {sunDays.map((d, i) => (
              <span key={d.date}>
                {i > 0 && " · "}
                {sunDays.length > 1 && `${weekday(d.date)} `}↑{sunTime(d.sunrise)} ↓{sunTime(d.sunset)}
              </span>
            ))}
          </p>
        )}
      </div>

      {/* Headline numbers — the answer before the chart. */}
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        <span className={`pill ${totalSnow >= 0.1 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
          ❄ {totalSnow >= 0.1 ? `${totalSnow.toFixed(1)}" snow` : "No snow"}
          {snowyIdx.length > 0 && totalSnow >= 0.1 && (
            <span className="ml-1 font-normal">
              ·{" "}
              {snowyIdx.length > 1
                ? `${timeName(snowyIdx[0])}–${hourLabel(hours[snowyIdx[snowyIdx.length - 1]].time)}, heaviest ${timeName(heaviestIdx)}`
                : `at ${timeName(snowyIdx[0])}`}
            </span>
          )}
        </span>
        {rainyHours > 0 && (
          <span className="pill bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300">
            💧 Rain likely {rainyHours} hr{rainyHours === 1 ? "" : "s"}
          </span>
        )}
        <span className="pill bg-muted text-foreground">
          🌡 {Math.round(lo)}° – {Math.round(hi)}°F
        </span>
        <span
          className={`pill ${peakGust >= WIND_HOLD_MPH ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" : peakGust >= WIND_WATCH_MPH ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" : "bg-muted text-foreground"}`}
        >
          💨 Gusts to {peakGust} mph · {timeName(gustIdx)}
        </span>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 pb-1">
        <div className="flex" style={{ minWidth: GUTTER_PX + n * COL_MIN_PX }}>
          {/* Row labels — stick to the left edge while the hours scroll. */}
          <div className="sticky left-0 z-20 shrink-0 bg-card pr-1 text-[11px] font-medium text-muted-foreground" style={{ width: GUTTER_PX }}>
            <div className="h-9" />
            <div className="flex h-8 items-center">Sky</div>
            <div className="relative" style={{ height: TEMP_ROW_PX }}>
              <span className="absolute top-1">Temp</span>
              {freezingVisible && (
                <span className="absolute -translate-y-1/2 text-[10px] text-primary" style={{ top: freezingY }}>
                  32°
                </span>
              )}
            </div>
            <div className="flex items-end pb-1" style={{ height: SNOW_ROW_PX }}>
              Snow
            </div>
            <div className="flex h-12 items-center">Wind</div>
          </div>

          <div className="relative min-w-0 flex-1">
            {/* Night shading + midnight dividers, behind every row. */}
            <div className="pointer-events-none absolute inset-0 grid" style={cols} aria-hidden>
              {hours.map((h, i) => (
                <div
                  key={h.time}
                  className={`${isNight(h.time) ? "bg-slate-500/[0.08] dark:bg-black/30" : ""} ${i > 0 && h.time.slice(11, 13) === "00" ? "border-l border-dashed border-border" : ""} ${i === 0 ? "rounded-l-lg" : ""} ${i === n - 1 ? "rounded-r-lg" : ""}`}
                />
              ))}
            </div>

            {/* Time */}
            <div className="relative grid h-9 items-end text-center text-[11px]" style={cols}>
              {hours.map((h, i) => {
                const newDay = i === 0 || h.time.slice(11, 13) === "00";
                return (
                  <div key={h.time} className="leading-tight">
                    <div className="h-3.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{newDay ? weekday(h.time.slice(0, 10)) : ""}</div>
                    <div className={i === 0 ? "font-bold text-primary" : "text-muted-foreground"}>{i === 0 ? "Now" : hourLabel(h.time)}</div>
                  </div>
                );
              })}
            </div>

            {/* Sky */}
            <div className="relative grid h-8 items-center text-center text-base" style={cols}>
              {hours.map((h) => {
                const s = sky(h.weatherCode, isNight(h.time));
                return (
                  <span key={h.time} title={s.label} role="img" aria-label={s.label}>
                    {s.icon}
                  </span>
                );
              })}
            </div>

            {/* Temperature line */}
            <div className="relative" style={{ height: TEMP_ROW_PX }}>
              <svg
                className="absolute inset-0 h-full w-full overflow-visible"
                viewBox={`0 0 ${n * VB_COL} ${TEMP_ROW_PX}`}
                preserveAspectRatio="none"
                aria-hidden
              >
                <defs>
                  <linearGradient id="hourly-temp-stroke" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={TEMP_ROW_PX}>
                    <stop offset={freezingStop} style={{ stopColor: "var(--accent)" }} />
                    <stop offset={freezingStop} style={{ stopColor: "var(--primary)" }} />
                  </linearGradient>
                  <linearGradient id="hourly-temp-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" style={{ stopColor: "var(--primary)", stopOpacity: 0.16 }} />
                    <stop offset="1" style={{ stopColor: "var(--primary)", stopOpacity: 0 }} />
                  </linearGradient>
                </defs>
                {freezingVisible && (
                  <line
                    x1={0}
                    x2={n * VB_COL}
                    y1={freezingY}
                    y2={freezingY}
                    stroke="var(--primary)"
                    strokeOpacity={0.45}
                    strokeDasharray="3 3"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                <path d={areaPath} fill="url(#hourly-temp-fill)" />
                <path
                  d={linePath}
                  fill="none"
                  stroke="url(#hourly-temp-stroke)"
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              {hours.map((h, i) => {
                const y = yOf(h.temperatureF);
                const warm = h.temperatureF > FREEZING_F;
                return (
                  <div key={h.time} className="absolute -translate-x-1/2" style={{ left: `${((i + 0.5) / n) * 100}%`, top: 0 }}>
                    <span
                      className="absolute left-1/2 -translate-x-1/2 text-[11px] font-semibold tabular-nums text-foreground"
                      style={{ top: y - 19 }}
                    >
                      {Math.round(h.temperatureF)}°
                    </span>
                    <span
                      className={`absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card ${warm ? "bg-accent" : "bg-primary"}`}
                      style={{ top: y, left: 0 }}
                    />
                  </div>
                );
              })}
            </div>

            {/* Snow (blue) / rain (teal) bars */}
            <div className="relative grid items-end border-b border-border" style={{ ...cols, height: SNOW_ROW_PX }}>
              {hours.map((h, i) => {
                const isSnow = h.snowfallIn >= 0.05;
                const isRain = !isSnow && h.precipitationIn >= 0.01;
                const px = isSnow ? Math.max(3, (h.snowfallIn / snowScale) * barMaxPx) : isRain ? Math.max(3, (h.precipitationIn / rainScale) * barMaxPx * 0.6) : 0;
                const title = isSnow
                  ? `${h.snowfallIn.toFixed(2)}" snow (${running[i].toFixed(1)}" total so far)`
                  : isRain
                    ? `${h.precipitationIn.toFixed(2)}" rain (liquid)`
                    : "Dry";
                return (
                  <div key={h.time} className="flex flex-col items-center justify-end" title={title}>
                    {(isSnow || isRain) && (
                      <span className={`text-[10px] font-semibold tabular-nums leading-none ${isSnow ? "text-primary" : "text-teal-600 dark:text-teal-400"}`}>
                        {isSnow ? inchesShort(h.snowfallIn) : "💧"}
                      </span>
                    )}
                    <div
                      className={`mt-0.5 w-3/5 max-w-5 rounded-t-sm ${isSnow ? "bg-primary" : isRain ? "bg-teal-500/70" : ""}`}
                      style={{ height: px }}
                    />
                  </div>
                );
              })}
            </div>

            {/* Wind: arrow points where the wind is blowing toward */}
            <div className="relative grid h-12 items-center text-center" style={cols}>
              {hours.map((h) => {
                const gusty = h.windGustMph > h.windSpeedMph + 3;
                const strongest = Math.max(h.windSpeedMph, h.windGustMph);
                return (
                  <div
                    key={h.time}
                    className="flex flex-col items-center leading-none"
                    title={`${Math.round(h.windSpeedMph)} mph from ${degToCompass(h.windDirectionDeg)}${gusty ? `, gusts ${Math.round(h.windGustMph)}` : ""}`}
                  >
                    <svg viewBox="0 0 12 12" className={`h-3 w-3 ${windTone(strongest)}`} style={{ transform: `rotate(${h.windDirectionDeg + 180}deg)` }} aria-hidden>
                      <path d="M6 1 L10 10 L6 8 L2 10 Z" fill="currentColor" />
                    </svg>
                    <span className={`mt-0.5 text-[11px] tabular-nums ${windTone(h.windSpeedMph)}`}>{Math.round(h.windSpeedMph)}</span>
                    <span className={`text-[9px] tabular-nums ${gusty ? windTone(h.windGustMph) : "text-transparent"}`}>{gusty ? `G${Math.round(h.windGustMph)}` : "·"}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-primary" /> Snow (in/hr)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-teal-500/70" /> Rain
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-primary" />≤32°F
          <span className="ml-1 h-2 w-2 rounded-full bg-accent" />above freezing
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-slate-500/20" /> Night
        </span>
        <span>
          Wind mph, <span className="font-semibold text-amber-600 dark:text-amber-400">{WIND_WATCH_MPH}+</span> /{" "}
          <span className="font-bold text-red-600 dark:text-red-400">{WIND_HOLD_MPH}+</span> can mean lift holds
        </span>
      </div>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs font-medium text-primary">View as table</summary>
        <p className="mb-2 mt-2 text-xs text-muted-foreground">
          Precip (liquid) is rain+snow water content, not snow depth — see Snow for that. {totalLiquid.toFixed(2)}&quot; liquid over the next {n} hours.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="sticky left-0 z-10 border-r border-border bg-card py-1 pr-4 font-medium">Time</th>
                <th className="py-1 pr-4 pl-4 font-medium">Sky</th>
                <th className="py-1 pr-4 font-medium">Temp</th>
                <th className="py-1 pr-4 font-medium">Snow</th>
                <th className="py-1 pr-4 font-medium">Precip (liquid)</th>
                <th className="py-1 font-medium">Wind</th>
              </tr>
            </thead>
            <tbody>
              {hours.map((h, i) => (
                <tr key={h.time} className="border-t border-border">
                  <td className="sticky left-0 z-10 border-r border-border bg-card py-1.5 pr-4 font-medium">
                    {i === 0 ? "Now" : `${weekday(h.time.slice(0, 10))} ${hourLabel(h.time)}`}
                  </td>
                  <td className="py-1.5 pr-4 pl-4">{sky(h.weatherCode, isNight(h.time)).label}</td>
                  <td className="py-1.5 pr-4">{Math.round(h.temperatureF)}°</td>
                  <td className="py-1.5 pr-4">{h.snowfallIn > 0 ? `${h.snowfallIn.toFixed(2)}"` : "—"}</td>
                  <td className="py-1.5 pr-4">{h.precipitationIn > 0 ? `${h.precipitationIn.toFixed(2)}"` : "—"}</td>
                  <td className="py-1.5">
                    {Math.round(h.windSpeedMph)}
                    {h.windGustMph > h.windSpeedMph + 3 ? ` G${Math.round(h.windGustMph)}` : ""} mph {degToCompass(h.windDirectionDeg)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

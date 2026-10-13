import type { DailyForecastDay, HistoricalDay } from "@/lib/models/types";
import SnowTimelineScroller from "@/components/location/SnowTimelineScroller";

// A single past+future snowfall timeline in one scannable strip, rather
// than the two separate "Past 7 days" / "14-day forecast" tables making
// the reader mentally stitch history and outlook together themselves.
// OpenSnow-style layout: the strip is split into 5-day blocks, each with
// its own total sitting directly above its bars, so "how much fell / is
// coming in this stretch" and "which day" read off the same glance.
// Chart form: magnitude-over-time, one hue (dataviz skill "sequential is
// the safe default" for a single measure) with an emphasis highlight on
// "Today" — past days render de-emphasized (context, already happened),
// future days in the primary hue (the actionable part).

const TIMELINE_FUTURE_DAYS = 14;
const GROUP_SIZE_DAYS = 5;
const BAR_MAX_HEIGHT_PX = 56;
const BAR_LABEL_HEIGHT_PX = 14;

interface TimelineDay {
  date: string;
  snowIn: number;
  isFuture: boolean;
  isToday: boolean;
}

interface TimelineGroup {
  label: string;
  isFuture: boolean;
  days: TimelineDay[];
}

function dayOfWeekLetter(iso: string): string {
  return "SMTWTFS"[new Date(iso + "T12:00:00").getDay()];
}

function dateNumber(iso: string): number {
  return new Date(iso + "T12:00:00").getDate();
}

function isWeekend(iso: string): boolean {
  const day = new Date(iso + "T12:00:00").getDay();
  return day === 0 || day === 6;
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso + "T12:00:00").getTime();
  const to = new Date(toIso + "T12:00:00").getTime();
  return Math.round((to - from) / 86400000);
}

// Compact inches label for the top of each bar: one decimal under 10",
// whole inches above so labels fit the 24px-wide column.
function formatBarInches(inches: number): string {
  return inches >= 10 ? `${Math.round(inches)}"` : `${inches.toFixed(1)}"`;
}

function formatGroupInches(inches: number): string {
  return inches > 0 ? `${inches.toFixed(1)}"` : '0"';
}

function buildGroups(historyDays: HistoricalDay[], forecastDays: DailyForecastDay[], todayDate: string): TimelineGroup[] {
  const groups: TimelineGroup[] = [];

  // History, oldest block first: "Prev 11-15", "Prev 6-10", "Prev 1-5".
  for (let maxAgo = GROUP_SIZE_DAYS * 3; maxAgo > 0; maxAgo -= GROUP_SIZE_DAYS) {
    const minAgo = maxAgo - GROUP_SIZE_DAYS + 1;
    const days = historyDays
      .filter((d) => {
        const ago = daysBetween(d.date, todayDate);
        return ago >= minAgo && ago <= maxAgo;
      })
      .map((d) => ({ date: d.date, snowIn: d.snowfallSumIn, isFuture: false, isToday: false }));
    if (days.length > 0) groups.push({ label: `Prev ${minAgo}-${maxAgo} Days`, isFuture: false, days });
  }

  // Forecast, today first: "Next 1-5" (today + 4), "Next 6-10", "Next 11-14".
  for (let start = 0; start < forecastDays.length; start += GROUP_SIZE_DAYS) {
    const slice = forecastDays.slice(start, start + GROUP_SIZE_DAYS);
    groups.push({
      label: `Next ${start + 1}-${start + slice.length} Days`,
      isFuture: true,
      days: slice.map((d) => ({ date: d.date, snowIn: d.snowfallSumIn, isFuture: true, isToday: d.date === todayDate })),
    });
  }

  return groups;
}

export default function SnowSummary({
  pastDays,
  forecastDaily,
}: {
  pastDays: HistoricalDay[];
  forecastDaily: DailyForecastDay[];
}) {
  const todayDate = forecastDaily[0]?.date;
  if (!todayDate) return null;

  // pastDays' lookback window can include today itself (archive-API lag
  // means that entry is often incomplete/zero anyway) — drop anything not
  // strictly before today so the forecast side owns "today" exclusively.
  const historyDays = pastDays.filter((d) => d.date < todayDate);
  const forecastDays = forecastDaily.slice(0, TIMELINE_FUTURE_DAYS);

  const groups = buildGroups(historyDays, forecastDays, todayDate);
  const maxSnowIn = Math.max(1, ...groups.flatMap((g) => g.days.map((d) => d.snowIn)));

  // Open the strip on the most recent history block (or the first forecast
  // block when there's no history) — see SnowTimelineScroller.
  const lastPastIndex = groups.findLastIndex((g) => !g.isFuture);
  const anchorIndex = lastPastIndex >= 0 ? lastPastIndex : 0;

  return (
    <section className="card p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-bold tracking-tight">Snow Summary</h2>
        <span className="text-xs text-muted-foreground">Past 15 days · next {TIMELINE_FUTURE_DAYS} days</span>
      </div>

      <SnowTimelineScroller>
        <div className="flex w-max gap-2">
          {groups.map((g, i) => {
            const total = g.days.reduce((sum, d) => sum + d.snowIn, 0);
            return (
              <div
                key={g.label}
                data-scroll-anchor={i === anchorIndex ? "" : undefined}
                className={`rounded-xl border px-1.5 pb-2 pt-2 ${
                  g.isFuture ? "border-primary/30 bg-primary/5" : "border-border bg-muted/60"
                }`}
              >
                <div className="mb-1 text-center">
                  <div className="whitespace-nowrap text-[11px] leading-tight text-muted-foreground">{g.label}</div>
                  <div className={`text-lg font-bold leading-tight tracking-tight ${g.isFuture && total > 0 ? "text-primary" : "text-foreground"}`}>
                    {formatGroupInches(total)}
                  </div>
                </div>

                <div className="flex items-end justify-center gap-1">
                  {g.days.map((d) => {
                    const barHeight = Math.round((d.snowIn / maxSnowIn) * BAR_MAX_HEIGHT_PX);
                    const barColor = d.isToday
                      ? "bg-accent"
                      : d.snowIn <= 0
                        ? "bg-transparent"
                        : d.isFuture
                          ? "bg-primary"
                          : "bg-muted-foreground/40";
                    return (
                      <div key={d.date} className="flex w-6 flex-col items-center gap-1" title={`${d.date}: ${d.snowIn.toFixed(1)}" snow`}>
                        <div
                          className="flex w-full flex-col items-center justify-end"
                          style={{ height: `${BAR_MAX_HEIGHT_PX + BAR_LABEL_HEIGHT_PX}px` }}
                        >
                          {d.snowIn >= 0.05 && (
                            <div
                              className={`mb-0.5 whitespace-nowrap text-[10px] font-semibold leading-none tabular-nums ${
                                d.isToday ? "text-accent" : d.isFuture ? "text-foreground" : "text-muted-foreground"
                              }`}
                            >
                              {formatBarInches(d.snowIn)}
                            </div>
                          )}
                          <div className={`w-3.5 rounded-t ${barColor}`} style={{ height: `${Math.max(barHeight, d.snowIn > 0 ? 3 : 0)}px` }} />
                        </div>
                        <div className="h-px w-full bg-border" />
                        <div className={`text-[10px] leading-none ${d.isToday ? "font-bold text-accent" : "text-muted-foreground"}`}>
                          {dayOfWeekLetter(d.date)}
                        </div>
                        <div className={`text-[11px] leading-none ${isWeekend(d.date) || d.isToday ? "font-bold text-foreground" : "text-muted-foreground"}`}>
                          {dateNumber(d.date)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </SnowTimelineScroller>

      <p className="mt-3 text-xs text-muted-foreground">
        Each block totals its days; bar labels are new snow that day (gray = past/actual, blue = forecast, orange = today). Swipe for more.
      </p>
    </section>
  );
}

import type { DailyForecastDay, HistoricalDay } from "@/lib/models/types";

// A single past+future snowfall timeline in one scannable strip, rather
// than the two separate "Past 7 days" / "14-day forecast" tables making
// the reader mentally stitch history and outlook together themselves.
// Chart form: magnitude-over-time, one hue (dataviz skill "sequential is
// the safe default" for a single measure) with an emphasis highlight on
// "Today" — past days render de-emphasized (context, already happened),
// future days in the primary hue (the actionable part).

const TIMELINE_FUTURE_DAYS = 14;
const BAR_MAX_HEIGHT_PX = 56;

interface TimelineDay {
  date: string;
  snowIn: number;
  isFuture: boolean;
  isToday: boolean;
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

function sumBucket(pastDays: HistoricalDay[], todayDate: string, minDaysAgo: number, maxDaysAgo: number): number {
  return pastDays.reduce((sum, d) => {
    const daysAgo = daysBetween(d.date, todayDate);
    return daysAgo >= minDaysAgo && daysAgo <= maxDaysAgo ? sum + d.snowfallSumIn : sum;
  }, 0);
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

  const timeline: TimelineDay[] = [
    ...historyDays.map((d) => ({ date: d.date, snowIn: d.snowfallSumIn, isFuture: false, isToday: false })),
    ...forecastDaily.slice(0, TIMELINE_FUTURE_DAYS).map((d) => ({
      date: d.date,
      snowIn: d.snowfallSumIn,
      isFuture: true,
      isToday: d.date === todayDate,
    })),
  ];

  const maxSnowIn = Math.max(1, ...timeline.map((d) => d.snowIn));

  const buckets = [
    { label: "Prev 11-15 Days", inches: sumBucket(historyDays, todayDate, 11, 15) },
    { label: "Prev 6-10 Days", inches: sumBucket(historyDays, todayDate, 6, 10) },
    { label: "Prev 1-5 Days", inches: sumBucket(historyDays, todayDate, 1, 5) },
  ];

  return (
    <section className="card p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-bold tracking-tight">❄️ Snow Summary</h2>
        <span className="text-xs text-muted-foreground">Past 15 days · next {TIMELINE_FUTURE_DAYS} days</span>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        {buckets.map((b) => (
          <div key={b.label} className="rounded-xl border border-border bg-muted px-2 py-2 text-center">
            <div className="text-xs text-muted-foreground">{b.label}</div>
            <div className="font-bold tracking-tight">{b.inches > 0 ? `${b.inches.toFixed(1)}"` : "0\""}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <div className="flex items-end gap-1" style={{ minWidth: `${timeline.length * 26}px` }}>
          {timeline.map((d) => {
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
                <div className="flex h-14 w-full items-end justify-center">
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
      <p className="mt-3 text-xs text-muted-foreground">
        Bar height is new snow that day (muted = past/actual, blue = forecast, orange = today). Exact numbers are in the tables below.
      </p>
    </section>
  );
}

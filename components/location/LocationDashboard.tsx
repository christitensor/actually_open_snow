import type { LocationDashboardData } from "@/lib/location-dashboard";
import FavoriteButton from "@/components/location/FavoriteButton";
import AlertSubscribeForm from "@/components/location/AlertSubscribeForm";
import ElevationAdjuster from "@/components/location/ElevationAdjuster";
import SnowSummary from "@/components/location/SnowSummary";
import WebcamGrid from "@/components/webcams/WebcamGrid";
import SkiMap from "@/components/map/SkiMap";
import { webcams as allWebcams } from "@/data/webcams";
import { degToCompass } from "@/lib/util/wind";

const HOURLY_DISPLAY_HOURS = 24;

// Open-Meteo's model blend (getForecast, forecast_days=16) already returns
// this many days — capped at 14 to match what we're comfortable actually
// showing as guidance (day 15-16 gets noticeably noisier).
const FORECAST_DISPLAY_DAYS = 14;

const SEVERITY_COLOR: Record<string, string> = {
  Extreme: "bg-red-600 text-white",
  Severe: "bg-orange-500 text-white",
  Moderate: "bg-amber-400 text-black",
  Minor: "bg-yellow-200 text-black",
};

function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function fmtHour(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric" });
}

const AQI_LABEL = (aqi: number): { label: string; color: string } => {
  if (aqi <= 50) return { label: "Good", color: "text-green-600 dark:text-green-400" };
  if (aqi <= 100) return { label: "Moderate", color: "text-yellow-600 dark:text-yellow-400" };
  if (aqi <= 150) return { label: "Unhealthy (sensitive)", color: "text-orange-600 dark:text-orange-400" };
  if (aqi <= 200) return { label: "Unhealthy", color: "text-red-600 dark:text-red-400" };
  return { label: "Very unhealthy+", color: "text-purple-600 dark:text-purple-400" };
};

export default function LocationDashboard({ data }: { data: LocationDashboardData }) {
  const {
    location,
    elevationFt,
    forecast,
    snowLevel,
    snowLineStatus,
    dailySnowLines,
    powderQualityToday,
    trailConditions,
    wetBulbNowF,
    alerts,
    avalancheZone,
    avalancheForecast,
    conditionsSummary,
    nearestSnotel,
    nearestNwsStations,
    airQuality,
    multiModelTodaySnowfallIn,
    pastDays,
    upcomingHours,
  } = data;

  const currentSnowLevelFt = snowLevel.points[0]?.snowLevelFt ?? snowLevel.points[0]?.freezingLevelFt ?? null;
  const resortWebcams = location.resortId ? allWebcams.filter((w) => w.resortId === location.resortId) : [];
  const todayForBaseline = forecast.daily[0];

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{location.name}</h1>
          <p className="text-sm text-muted-foreground">
            {location.lat.toFixed(4)}, {location.lon.toFixed(4)}
            {elevationFt != null ? ` · ${elevationFt.toLocaleString()} ft` : ""}
            {location.source === "pin" ? " · Backcountry pin" : ""}
          </p>
        </div>
        <FavoriteButton location={location} />
      </header>

      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a) => (
            <div key={a.id} className={`rounded-2xl px-4 py-2.5 text-sm font-medium shadow-sm ${SEVERITY_COLOR[a.severity] ?? "bg-muted text-foreground"}`}>
              <strong>{a.event}</strong> — {a.headline}
            </div>
          ))}
        </div>
      )}

      {/* Below lg: everything stacks full-width, map last — unchanged
          mobile layout. At lg+: main content in a flowing left column,
          map pinned in a sticky right sidebar so it stays visible while
          scrolling through a long page, instead of only reachable at the
          very bottom of a stretched single column. */}
      <div className="lg:flex lg:items-start lg:gap-6">
        <div className="space-y-5 lg:min-w-0 lg:flex-1">
          <section className="card p-4">
            <h2 className="mb-2 font-bold tracking-tight">Conditions summary</h2>
            <p className="text-sm leading-relaxed text-foreground/90">{conditionsSummary.narrative}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={`pill ${conditionsSummary.corroboration.modelsAgree ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"}`}>
                {conditionsSummary.corroboration.modelsAgree ? "Models agree" : "Models disagree"}
              </span>
              {conditionsSummary.corroboration.afdMentionsUncertainty && (
                <span className="pill bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">NWS discussion flags uncertainty</span>
              )}
            </div>
          </section>

          <SnowSummary pastDays={pastDays} forecastDaily={forecast.daily} />

          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Snow level" value={currentSnowLevelFt != null ? `${currentSnowLevelFt.toLocaleString()} ft` : "—"} sub={snowLevel.nwsAvailable ? "NWS" : "Open-Meteo est."} />
            <StatTile label="Elevation vs. snow line" value={snowLineStatus === "unknown" ? "—" : snowLineStatus === "above" ? "Above" : "Below"} />
            <StatTile label="Today's new snow" value={`${forecast.daily[0]?.snowfallSumIn.toFixed(1) ?? "0.0"}"`} />
            <StatTile label="Powder quality" value={powderQualityToday?.quality ?? "No new snow"} sub={powderQualityToday ? `~${powderQualityToday.estimatedRatio}:1 (est.)` : undefined} />
            <StatTile label="Trail conditions (est.)" value={trailConditions?.label ?? "—"} sub={trailConditions?.detail} />
            <StatTile label="Wet-bulb temp" value={wetBulbNowF != null ? `${Math.round(wetBulbNowF)}°F` : "—"} sub="Snowmaking-relevant" />
            <StatTile
              label="Air quality"
              value={airQuality?.currentUsAqi != null ? `${airQuality.currentUsAqi} AQI` : "—"}
              sub={airQuality?.currentUsAqi != null ? AQI_LABEL(airQuality.currentUsAqi).label : undefined}
            />
          </section>

          <section className="card p-4">
            <h2 className="mb-1 font-bold tracking-tight">{FORECAST_DISPLAY_DAYS}-day forecast</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Days 8+ are lower-confidence trend guidance from Open-Meteo&apos;s model blend, not a precise day-by-day
              call — treat them as a heads-up on pattern changes, not a packing list.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="sticky left-0 z-10 border-r border-border bg-card py-1 pr-4 font-medium">Day</th>
                    <th className="py-1 pr-4 font-medium">High / Low</th>
                    <th className="py-1 pr-4 font-medium">New snow</th>
                    <th className="py-1 pr-4 font-medium">Precip (liquid)</th>
                    <th className="py-1 pr-4 font-medium">Snow line</th>
                    <th className="py-1 font-medium">Wind</th>
                  </tr>
                </thead>
                <tbody>
                  {forecast.daily.slice(0, FORECAST_DISPLAY_DAYS).map((d, i) => {
                    const snowLine = dailySnowLines[i];
                    return (
                      <tr key={d.date} className={`border-t border-border ${i >= 7 ? "text-muted-foreground" : ""}`}>
                        <td className="sticky left-0 z-10 border-r border-border bg-card py-1.5 pr-4 font-medium">{fmtDate(d.date)}</td>
                        <td className="py-1.5 pr-4">{Math.round(d.tempMaxF)}° / {Math.round(d.tempMinF)}°</td>
                        <td className="py-1.5 pr-4">{d.snowfallSumIn > 0 ? `${d.snowfallSumIn.toFixed(1)}"` : "—"}</td>
                        <td className="py-1.5 pr-4">{d.precipitationSumIn.toFixed(2)}&quot;</td>
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
            </p>
          </section>

          {upcomingHours.length > 0 && (
            <section className="card p-4">
              <h2 className="mb-3 font-bold tracking-tight">Next {HOURLY_DISPLAY_HOURS} hours</h2>
              <p className="mb-2 text-xs text-muted-foreground">Precip (liquid) is rain+snow water content, not snow depth — see New snow for that.</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="sticky left-0 z-10 border-r border-border bg-card py-1 pr-4 font-medium">Time</th>
                      <th className="py-1 pr-4 font-medium">Temp</th>
                      <th className="py-1 pr-4 font-medium">Snow</th>
                      <th className="py-1 pr-4 font-medium">Precip (liquid)</th>
                      <th className="py-1 font-medium">Wind</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcomingHours.map((h) => (
                      <tr key={h.time} className="border-t border-border">
                        <td className="sticky left-0 z-10 border-r border-border bg-card py-1.5 pr-4 font-medium">{fmtHour(h.time)}</td>
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
            </section>
          )}

          {todayForBaseline && (
            <ElevationAdjuster location={location} elevationFt={elevationFt} baselineToday={todayForBaseline} />
          )}

          {resortWebcams.length > 0 && (
            <section className="card p-4">
              <h2 className="mb-3 font-bold tracking-tight">Live webcams</h2>
              <WebcamGrid webcams={resortWebcams} />
            </section>
          )}

          {multiModelTodaySnowfallIn && (
            <section className="card p-4">
              <h2 className="mb-2 font-bold tracking-tight">Today&apos;s new snow — by model</h2>
              <div className="flex flex-wrap gap-2 text-sm">
                {Object.entries(multiModelTodaySnowfallIn).map(([model, inches]) => (
                  <div key={model} className="rounded-xl border border-border bg-muted px-3 py-1.5">
                    <span className="text-muted-foreground">{model.replace(/_seamless|_ifs04/g, "")}</span>{" "}
                    <span className="font-semibold">{inches.toFixed(1)}&quot;</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="card p-4">
            <h2 className="mb-2 font-bold tracking-tight">Avalanche forecast</h2>
            {avalancheForecast ? (
              <div className="space-y-3 text-sm">
                <div className="flex gap-4">
                  <DangerBadge label="Above treeline" level={avalancheForecast.dangerAboveTreeline} />
                  <DangerBadge label="Near treeline" level={avalancheForecast.dangerNearTreeline} />
                  <DangerBadge label="Below treeline" level={avalancheForecast.dangerBelowTreeline} />
                </div>
                <p className="text-foreground/90">{avalancheForecast.summary}</p>
                <a href={avalancheForecast.url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
                  Full forecast ↗
                </a>
              </div>
            ) : avalancheZone ? (
              <p className="text-sm text-muted-foreground">Zone matched ({avalancheZone.zoneName}) but forecast couldn&apos;t be loaded.</p>
            ) : (
              <p className="text-sm text-muted-foreground">No avalanche forecast zone covers this point (outside avalanche.org coverage, or the point/zone-boundary API needs verification — see ARCHITECTURE.md).</p>
            )}
          </section>

          {pastDays.length > 0 && (
            <section className="card p-4">
              <h2 className="mb-3 font-bold tracking-tight">Past 7 days</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="sticky left-0 z-10 border-r border-border bg-card py-1 pr-4 font-medium">Day</th>
                      <th className="py-1 pr-4 font-medium">High / Low</th>
                      <th className="py-1 font-medium">Snow</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pastDays.slice(-7).map((d) => (
                      <tr key={d.date} className="border-t border-border">
                        <td className="sticky left-0 z-10 border-r border-border bg-card py-1.5 pr-4 font-medium">{fmtDate(d.date)}</td>
                        <td className="py-1.5 pr-4">{Math.round(d.tempMaxF)}° / {Math.round(d.tempMinF)}°</td>
                        <td className="py-1.5">{d.snowfallSumIn > 0 ? `${d.snowfallSumIn.toFixed(1)}"` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {(nearestSnotel || nearestNwsStations.length > 0) && (
            <section className="card p-4">
              <h2 className="mb-1 font-bold tracking-tight">Nearby stations</h2>
              {nearestSnotel && (
                <p className="text-sm text-foreground/90">
                  <strong>SNOTEL</strong> — {nearestSnotel.station.name} ({nearestSnotel.station.distanceMi.toFixed(1)} mi away, {nearestSnotel.station.elevationFt.toLocaleString()} ft) —{" "}
                  {nearestSnotel.snowDepthIn != null ? `${nearestSnotel.snowDepthIn}" snow depth` : "no depth reading"}
                  {nearestSnotel.sweIn != null ? `, ${nearestSnotel.sweIn}" SWE` : ""} as of {nearestSnotel.date}.
                </p>
              )}
              {nearestNwsStations.length > 0 && (
                <p className="mt-1 text-sm text-foreground/90">
                  <strong>NWS observation stations</strong> — {nearestNwsStations.slice(0, 3).map((s) => s.name).join(", ")}
                </p>
              )}
            </section>
          )}

          <section className="card p-4">
            <h2 className="mb-2 font-bold tracking-tight">Snow alerts</h2>
            <AlertSubscribeForm location={location} />
          </section>
        </div>

        <aside className="mt-5 lg:mt-0 lg:w-96 lg:shrink-0">
          <section className="card h-72 overflow-hidden lg:sticky lg:top-20 lg:h-[calc(100vh-7rem)]">
            <SkiMap
              resorts={[{ id: "current", name: location.name, lat: location.lat, lon: location.lon }]}
              center={[location.lon, location.lat]}
              zoom={11}
              showPistes={false}
              allowPinDrop={false}
              showRadarToggle={false}
              showSnowForecastToggle={false}
            />
          </section>
        </aside>
      </div>
    </div>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat-tile">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-bold tracking-tight">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function DangerBadge({ label, level }: { label: string; level: number | null }) {
  const colors = ["bg-muted", "bg-green-500", "bg-yellow-400", "bg-orange-500", "bg-red-600", "bg-black"];
  const color = level != null && level >= 0 && level <= 5 ? colors[level] : "bg-muted";
  return (
    <div className="text-center">
      <div className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm ${color}`}>
        {level ?? "?"}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

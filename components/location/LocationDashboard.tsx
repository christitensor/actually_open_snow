import type { LocationDashboardData } from "@/lib/location-dashboard";
import FavoriteButton from "@/components/location/FavoriteButton";
import WakeAlarmForm from "@/components/location/WakeAlarmForm";
import ForecastTable from "@/components/location/ForecastTable";
import HourlyForecast from "@/components/location/HourlyForecast";
import ForecastDiscussion from "@/components/location/ForecastDiscussion";
import DangerRose from "@/components/location/DangerRose";
import SnowSummary from "@/components/location/SnowSummary";
import WebcamGrid from "@/components/webcams/WebcamGrid";
import SkiMap from "@/components/map/SkiMap";
import { resorts } from "@/data/resorts";
import { webcams as allWebcams } from "@/data/webcams";
import { degToCompass } from "@/lib/util/wind";
import Section, { SectionControls } from "@/components/ui/Section";

const SEVERITY_COLOR: Record<string, string> = {
  Extreme: "bg-red-600 text-white",
  Severe: "bg-orange-500 text-white",
  Moderate: "bg-amber-400 text-black",
  Minor: "bg-yellow-200 text-black",
};

function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
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
    afd,
    nearestSnotel,
    nearestNwsStations,
    keyStations,
    keyStationsRangeName,
    airQuality,
    multiModelTodaySnowfallIn,
    pastDays,
    upcomingHours,
  } = data;

  const currentSnowLevelFt = snowLevel.points[0]?.snowLevelFt ?? snowLevel.points[0]?.freezingLevelFt ?? null;
  const resortWebcams = location.resortId ? allWebcams.filter((w) => w.resortId === location.resortId) : [];

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
        <div className="flex items-center gap-2">
          <SectionControls />
          <FavoriteButton location={location} />
        </div>
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

      {/* Below md: everything stacks full-width, map last — unchanged
          mobile layout. At md+ (incl. an unfolded iPhone Duo in landscape): main content in a flowing left column,
          map pinned in a sticky right sidebar so it stays visible while
          scrolling through a long page, instead of only reachable at the
          very bottom of a stretched single column. */}
      <div className="md:flex md:items-start md:gap-6">
        <div className="space-y-5 md:min-w-0 md:flex-1">
          <Section id="conditions-summary" title="Conditions summary" summary={conditionsSummary.narrative}>
            <p className="text-sm leading-relaxed text-foreground/90">{conditionsSummary.narrative}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={`pill ${conditionsSummary.corroboration.modelsAgree ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"}`}>
                {conditionsSummary.corroboration.modelsAgree ? "Models agree" : "Models disagree"}
              </span>
              {conditionsSummary.corroboration.afdMentionsUncertainty && (
                <span className="pill bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">NWS discussion flags uncertainty</span>
              )}
            </div>
          </Section>

          <SnowSummary pastDays={pastDays} forecastDaily={forecast.daily} />

          <Section
            id="current-conditions"
            title="Current conditions"
            summary={[
              currentSnowLevelFt != null ? `Snow level ${currentSnowLevelFt.toLocaleString()} ft` : null,
              powderQualityToday?.quality ?? null,
              trailConditions?.label ?? null,
              airQuality?.currentUsAqi != null ? `${airQuality.currentUsAqi} AQI` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
          </div>
          </Section>

          <ForecastTable
            location={location}
            elevationFt={elevationFt}
            dailyForecast={forecast.daily}
            dailySnowLines={dailySnowLines}
            elevationModel={data.elevationModel}
          />

          <HourlyForecast hours={upcomingHours} daily={forecast.daily} />

          {resortWebcams.length > 0 && (
            <Section id="webcams" title="Live webcams" summary={`${resortWebcams.length} camera${resortWebcams.length === 1 ? "" : "s"}`} defaultOpen={false}>
              <WebcamGrid webcams={resortWebcams} />
            </Section>
          )}

          {multiModelTodaySnowfallIn && (
            <Section
              id="models"
              title="Today’s new snow — by model"
              summary={(() => {
                const v = Object.values(multiModelTodaySnowfallIn);
                return v.length ? `Models range ${Math.min(...v).toFixed(1)}–${Math.max(...v).toFixed(1)}"` : undefined;
              })()}
              defaultOpen={false}
            >
              <div className="flex flex-wrap gap-2 text-sm">
                {Object.entries(multiModelTodaySnowfallIn).map(([model, inches]) => (
                  <div key={model} className="rounded-xl border border-border bg-muted px-3 py-1.5">
                    <span className="text-muted-foreground">{model.replace(/_seamless|_ifs04/g, "")}</span>{" "}
                    <span className="font-semibold">{inches.toFixed(1)}&quot;</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section
            id="avalanche"
            title="Avalanche forecast"
            summary={
              avalancheForecast &&
              [avalancheForecast.dangerAboveTreeline, avalancheForecast.dangerNearTreeline, avalancheForecast.dangerBelowTreeline].every((l) => l == null || l <= 0)
                ? "No danger ratings posted right now"
                : avalancheForecast
                ? `Danger ${avalancheForecast.dangerAboveTreeline ?? "?"} / ${avalancheForecast.dangerNearTreeline ?? "?"} / ${avalancheForecast.dangerBelowTreeline ?? "?"} (above / near / below treeline)`
                : avalancheZone
                  ? "Forecast unavailable"
                  : "No forecast zone here"
            }
            defaultOpen={false}
          >
            {avalancheForecast ? (
              <div className="space-y-3 text-sm">
                <DangerRose
                  aboveTreeline={avalancheForecast.dangerAboveTreeline}
                  nearTreeline={avalancheForecast.dangerNearTreeline}
                  belowTreeline={avalancheForecast.dangerBelowTreeline}
                />
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
          </Section>

          {pastDays.length > 0 && (
            <Section
              id="past-7-days"
              title="Past 7 days"
              summary={`${pastDays.slice(-7).reduce((s, d) => s + d.snowfallSumIn, 0).toFixed(1)}" of snow`}
              defaultOpen={false}
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="sticky left-0 z-10 border-r border-border bg-card py-1 pr-4 font-medium">Day</th>
                      <th className="py-1 pr-4 pl-4 font-medium">High / Low</th>
                      <th className="py-1 font-medium">Snow</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pastDays.slice(-7).map((d) => (
                      <tr key={d.date} className="border-t border-border">
                        <td className="sticky left-0 z-10 border-r border-border bg-card py-1.5 pr-4 font-medium">{fmtDate(d.date)}</td>
                        <td className="py-1.5 pr-4 pl-4">{Math.round(d.tempMaxF)}° / {Math.round(d.tempMinF)}°</td>
                        <td className="py-1.5">{d.snowfallSumIn > 0 ? `${d.snowfallSumIn.toFixed(1)}"` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {keyStations.length > 0 && (
            <Section
              id="key-stations"
              title={`${keyStationsRangeName} weather stations`}
              summary={keyStations
                .slice(0, 3)
                .map((st) => `${st.name} ${st.tempF != null ? `${Math.round(st.tempF)}°F` : "—"}`)
                .join(" · ")}
              defaultOpen={false}
            >
              <p className="mb-3 text-xs text-muted-foreground">
                Curated high-elevation stations backcountry travelers actually watch here — the generic
                &quot;nearest station&quot; is almost always a valley airport, which doesn&apos;t tell you much about
                conditions up high.
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {keyStations.map((s) => (
                  <div key={s.name} className="stat-tile">
                    <div className="text-xs text-muted-foreground">
                      {s.name} · {s.elevationFt.toLocaleString()} ft
                    </div>
                    <div className="text-lg font-bold tracking-tight">{s.tempF != null ? `${Math.round(s.tempF)}°F` : "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.windSpeedMph != null
                        ? `${Math.round(s.windSpeedMph)} mph${s.windDirectionDeg != null ? ` ${degToCompass(s.windDirectionDeg)}` : ""}`
                        : "No wind data"}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {(nearestSnotel || nearestNwsStations.length > 0) && (
            <Section
              id="nearby-stations"
              title="Nearby stations"
              summary={
                nearestSnotel
                  ? `SNOTEL ${nearestSnotel.station.name}: ${nearestSnotel.snowDepthIn != null ? `${nearestSnotel.snowDepthIn}" depth` : "no depth reading"}`
                  : nearestNwsStations[0]?.name
              }
              defaultOpen={false}
            >
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
            </Section>
          )}

          <ForecastDiscussion afd={afd} />

          <Section id="wake-alarm" title="Powder wake-up" summary="Get pinged when a powder morning is coming" defaultOpen={false}>
            <WakeAlarmForm location={location} />
          </Section>
        </div>

        <aside className="mt-5 md:mt-0 md:w-80 md:shrink-0 lg:w-96">
          <section className="card h-72 overflow-hidden md:sticky md:top-20 md:h-[calc(100dvh-7rem)]">
            <SkiMap
              resorts={resorts}
              webcams={allWebcams}
              currentLocation={{ name: location.name, lat: location.lat, lon: location.lon }}
              center={[location.lon, location.lat]}
              zoom={9}
              showPistes={false}
              allowPinDrop
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

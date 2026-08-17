import type { LocationDashboardData } from "@/lib/location-dashboard";
import FavoriteButton from "@/components/location/FavoriteButton";
import SkiMap from "@/components/map/SkiMap";

const SEVERITY_COLOR: Record<string, string> = {
  Extreme: "bg-red-600 text-white",
  Severe: "bg-orange-500 text-white",
  Moderate: "bg-amber-400 text-black",
  Minor: "bg-yellow-200 text-black",
};

function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export default function LocationDashboard({ data }: { data: LocationDashboardData }) {
  const { location, elevationFt, forecast, snowLevel, snowLineStatus, powderQualityToday, alerts, avalancheZone, avalancheForecast, conditionsSummary, nearestSnotel } = data;

  const currentSnowLevelFt = snowLevel.points[0]?.snowLevelFt ?? snowLevel.points[0]?.freezingLevelFt ?? null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{location.name}</h1>
          <p className="text-sm text-gray-500">
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
            <div key={a.id} className={`rounded-lg px-4 py-2 text-sm font-medium ${SEVERITY_COLOR[a.severity] ?? "bg-gray-200 text-black"}`}>
              <strong>{a.event}</strong> — {a.headline}
            </div>
          ))}
        </div>
      )}

      <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
        <h2 className="mb-2 font-semibold">Conditions summary</h2>
        <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">{conditionsSummary.narrative}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-500">
          <span className={`rounded px-2 py-0.5 ${conditionsSummary.corroboration.modelsAgree ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
            {conditionsSummary.corroboration.modelsAgree ? "Models agree" : "Models disagree"}
          </span>
          {conditionsSummary.corroboration.afdMentionsUncertainty && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">NWS discussion flags uncertainty</span>
          )}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Snow level" value={currentSnowLevelFt != null ? `${currentSnowLevelFt.toLocaleString()} ft` : "—"} sub={snowLevel.nwsAvailable ? "NWS" : "Open-Meteo est."} />
        <StatTile label="Elevation vs. snow line" value={snowLineStatus === "unknown" ? "—" : snowLineStatus === "above" ? "Above ❄️" : "Below 🌧️"} />
        <StatTile label="Today's new snow" value={`${forecast.daily[0]?.snowfallSumIn.toFixed(1) ?? "0.0"}"`} />
        <StatTile label="Powder quality" value={powderQualityToday?.quality ?? "No new snow"} sub={powderQualityToday ? `~${powderQualityToday.estimatedRatio}:1 (est.)` : undefined} />
      </section>

      <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
        <h2 className="mb-3 font-semibold">7-day forecast</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[500px] text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-1 pr-4">Day</th>
                <th className="py-1 pr-4">High / Low</th>
                <th className="py-1 pr-4">New snow</th>
                <th className="py-1 pr-4">Precip</th>
                <th className="py-1">Wind</th>
              </tr>
            </thead>
            <tbody>
              {forecast.daily.slice(0, 7).map((d) => (
                <tr key={d.date} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="py-1.5 pr-4 font-medium">{fmtDate(d.date)}</td>
                  <td className="py-1.5 pr-4">{Math.round(d.tempMaxF)}° / {Math.round(d.tempMinF)}°</td>
                  <td className="py-1.5 pr-4">{d.snowfallSumIn > 0 ? `${d.snowfallSumIn.toFixed(1)}"` : "—"}</td>
                  <td className="py-1.5 pr-4">{d.precipitationSumIn.toFixed(2)}&quot;</td>
                  <td className="py-1.5">{Math.round(d.windSpeedMaxMph)} mph</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
        <h2 className="mb-2 font-semibold">Avalanche forecast</h2>
        {avalancheForecast ? (
          <div className="space-y-2 text-sm">
            <div className="flex gap-4">
              <DangerBadge label="Above treeline" level={avalancheForecast.dangerAboveTreeline} />
              <DangerBadge label="Near treeline" level={avalancheForecast.dangerNearTreeline} />
              <DangerBadge label="Below treeline" level={avalancheForecast.dangerBelowTreeline} />
            </div>
            <p className="text-gray-700 dark:text-gray-300">{avalancheForecast.summary}</p>
            <a href={avalancheForecast.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              Full forecast ↗
            </a>
          </div>
        ) : avalancheZone ? (
          <p className="text-sm text-gray-500">Zone matched ({avalancheZone.zoneName}) but forecast couldn&apos;t be loaded.</p>
        ) : (
          <p className="text-sm text-gray-500">No avalanche forecast zone covers this point (outside avalanche.org coverage, or the point/zone-boundary API needs verification — see ARCHITECTURE.md).</p>
        )}
      </section>

      {nearestSnotel && (
        <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
          <h2 className="mb-1 font-semibold">Nearest SNOTEL station</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {nearestSnotel.station.name} ({nearestSnotel.station.distanceMi.toFixed(1)} mi away, {nearestSnotel.station.elevationFt.toLocaleString()} ft) —{" "}
            {nearestSnotel.snowDepthIn != null ? `${nearestSnotel.snowDepthIn}" snow depth` : "no depth reading"}
            {nearestSnotel.sweIn != null ? `, ${nearestSnotel.sweIn}" SWE` : ""} as of {nearestSnotel.date}.
          </p>
        </section>
      )}

      <section className="h-72 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
        <SkiMap
          resorts={[{ id: "current", name: location.name, lat: location.lat, lon: location.lon }]}
          center={[location.lon, location.lat]}
          zoom={11}
          showPistes={false}
          allowPinDrop={false}
        />
      </section>
    </div>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-800">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
    </div>
  );
}

function DangerBadge({ label, level }: { label: string; level: number | null }) {
  const colors = ["bg-gray-200", "bg-green-500", "bg-yellow-400", "bg-orange-500", "bg-red-600", "bg-black"];
  const color = level != null && level >= 0 && level <= 5 ? colors[level] : "bg-gray-200";
  return (
    <div className="text-center">
      <div className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white ${color}`}>
        {level ?? "?"}
      </div>
      <div className="mt-1 text-xs text-gray-500">{label}</div>
    </div>
  );
}

import HomeExplorer from "@/components/location/HomeExplorer";
import { resorts } from "@/data/resorts";
import { webcams } from "@/data/webcams";
import { getGridSnowSummaryIn } from "@/lib/data-sources/open-meteo";
import { getMeasuredSnowNearPoints } from "@/lib/data-sources/snotel";
import { withTimeout } from "@/lib/util/with-timeout";

// Resorts now span ~500 mi around Salt Lake City (data/resorts.json); the
// map still opens on the Wasatch Front, where the app started.
const REGION_CENTER: [number, number] = [-111.75, 41.2];

export default async function Home() {
  const points = resorts.map((r) => ({ lat: r.lat, lon: r.lon }));
  const empty: { todayIn: number; pastIn: number[] }[] = [];

  // MAP-10 Powder Finder (today) + the "quick forecast visual" 12h/7d
  // totals, all in one batched Open-Meteo call across every seeded resort.
  // Plus measured snow at each resort's nearest SNOTEL (best-effort, capped
  // so a slow NRCS API never holds up the page).
  const [snow, measured] = await Promise.all([
    getGridSnowSummaryIn(points, [12, 7 * 24]).catch(() => empty),
    withTimeout(getMeasuredSnowNearPoints(points), 4000).catch(() => []),
  ]);
  const resortsWithSnow = resorts.map((r, i) => ({
    id: r.id,
    name: r.name,
    region: r.region,
    lat: r.lat,
    lon: r.lon,
    snowfallTodayIn: snow[i]?.todayIn,
    last12hIn: snow[i]?.pastIn[0],
    last7dIn: snow[i]?.pastIn[1],
    measured: measured[i] ?? null,
  }));

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6">
      <HomeExplorer resorts={resortsWithSnow} webcams={webcams} center={REGION_CENTER} fetchedAt={new Date().toISOString()} />
    </div>
  );
}

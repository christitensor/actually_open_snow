import HomeExplorer from "@/components/location/HomeExplorer";
import { primaryResortIds, resorts } from "@/data/resorts";
import { webcams } from "@/data/webcams";
import { getGridDailySnowfallIn, getGridPastDailySnowfallIn, getGridRecentSnowfallIn } from "@/lib/data-sources/open-meteo";

// Phase 1 regional scope (TRACE_MATRIX.md): Northern Utah & Southeast Idaho.
// Centered roughly on the Wasatch Front.
const REGION_CENTER: [number, number] = [-111.75, 41.2];

export default async function Home() {
  const points = resorts.map((r) => ({ lat: r.lat, lon: r.lon }));
  const empty: { lat: number; lon: number; valueIn: number }[] = [];

  // MAP-10 Powder Finder (today) + the "quick forecast visual" 12h/7d
  // totals, each batched into one Open-Meteo call across every seeded resort.
  const [snowfall, last12h, last7d] = await Promise.all([
    getGridDailySnowfallIn(points).catch(() => empty),
    getGridRecentSnowfallIn(points, 12).catch(() => empty),
    getGridPastDailySnowfallIn(points, 7).catch(() => empty),
  ]);
  const resortsWithSnow = resorts.map((r, i) => ({
    id: r.id,
    name: r.name,
    region: r.region,
    lat: r.lat,
    lon: r.lon,
    snowfallTodayIn: snowfall[i]?.valueIn,
    last12hIn: last12h[i]?.valueIn,
    last7dIn: last7d[i]?.valueIn,
  }));

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6">
      <HomeExplorer resorts={resortsWithSnow} webcams={webcams} primaryIds={primaryResortIds} center={REGION_CENTER} fetchedAt={new Date().toISOString()} />
    </div>
  );
}

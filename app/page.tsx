import Link from "next/link";
import SkiMap from "@/components/map/SkiMap";
import FavoritesList from "@/components/location/FavoritesList";
import MyLocationButton from "@/components/location/MyLocationButton";
import ResortList from "@/components/location/ResortList";
import { primaryResortIds, resorts } from "@/data/resorts";
import { webcams } from "@/data/webcams";
import { getGridDailySnowfallIn } from "@/lib/data-sources/open-meteo";

// Phase 1 regional scope (TRACE_MATRIX.md): Northern Utah & Southeast Idaho.
// Centered roughly on the Wasatch Front.
const REGION_CENTER: [number, number] = [-111.75, 41.2];

export default async function Home() {
  // MAP-10 Powder Finder: today's forecast snowfall for every seeded
  // resort, batched into one Open-Meteo call.
  const snowfall = await getGridDailySnowfallIn(resorts.map((r) => ({ lat: r.lat, lon: r.lon }))).catch(
    () => [] as { lat: number; lon: number; valueIn: number }[]
  );
  const resortsWithSnow = resorts.map((r, i) => ({
    id: r.id,
    name: r.name,
    region: r.region,
    lat: r.lat,
    lon: r.lon,
    snowfallTodayIn: snowfall[i]?.valueIn,
  }));

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Actually Open Snow</h1>
          <p className="text-sm text-gray-500">
            Open-data snow forecasts for Northern Utah & Southeast Idaho — pick a resort, or drop a pin anywhere for backcountry conditions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/webcams" className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium hover:border-blue-400 hover:text-blue-600 dark:border-gray-700">
            📷 Webcams
          </Link>
          <MyLocationButton />
        </div>
      </header>

      <section className="h-[60vh] min-h-[400px] overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
        <SkiMap resorts={resortsWithSnow} webcams={webcams} center={REGION_CENTER} zoom={8} />
      </section>
      <p className="-mt-4 text-xs text-gray-400">
        Resort pins are colored by today&apos;s forecast snowfall (Powder Finder, est.), orange pins are webcams — click either for details, or click anywhere else on the map to drop a backcountry pin.
      </p>

      <div className="grid gap-6 sm:grid-cols-2">
        <section>
          <h2 className="mb-2 font-semibold">Resorts</h2>
          <ResortList resorts={resortsWithSnow} primaryIds={primaryResortIds} />
        </section>

        <section>
          <h2 className="mb-2 font-semibold">Your backcountry spots</h2>
          <FavoritesList />
        </section>
      </div>
    </div>
  );
}

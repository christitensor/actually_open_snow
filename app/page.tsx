import Link from "next/link";
import SkiMap from "@/components/map/SkiMap";
import FavoritesList from "@/components/location/FavoritesList";
import MyLocationButton from "@/components/location/MyLocationButton";
import { resorts } from "@/data/resorts";
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
    lat: r.lat,
    lon: r.lon,
    snowfallTodayIn: snowfall[i]?.valueIn,
  }));
  const powderRanked = [...resortsWithSnow].sort((a, b) => (b.snowfallTodayIn ?? 0) - (a.snowfallTodayIn ?? 0));

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Actually Open Snow</h1>
          <p className="text-sm text-gray-500">
            Open-data snow forecasts for Northern Utah & Southeast Idaho — pick a resort, or drop a pin anywhere for backcountry conditions.
          </p>
        </div>
        <MyLocationButton />
      </header>

      <section className="h-[60vh] min-h-[400px] overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
        <SkiMap resorts={resortsWithSnow} webcams={webcams} center={REGION_CENTER} zoom={8} />
      </section>
      <p className="-mt-4 text-xs text-gray-400">
        Resort pins are colored by today&apos;s forecast snowfall (Powder Finder, est.), orange pins are webcams — click either for details, or click anywhere else on the map to drop a backcountry pin.
      </p>

      <div className="grid gap-6 sm:grid-cols-3">
        <section>
          <h2 className="mb-2 font-semibold">Powder Finder — today</h2>
          <ul className="space-y-1">
            {powderRanked.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/location/${r.id}`}
                  className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium hover:border-blue-400 hover:text-blue-600 dark:border-gray-800"
                >
                  <span>{r.name}</span>
                  <span className="text-xs font-semibold text-gray-500">
                    {r.snowfallTodayIn != null ? `${r.snowfallTodayIn.toFixed(1)}"` : "—"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-2 font-semibold">All resorts</h2>
          <ul className="space-y-1">
            {resorts.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/location/${r.id}`}
                  className="block rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium hover:border-blue-400 hover:text-blue-600 dark:border-gray-800"
                >
                  {r.name}
                  <span className="ml-1 text-xs font-normal text-gray-400">{r.region}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-2 font-semibold">Favorites</h2>
          <FavoritesList />
        </section>
      </div>
    </div>
  );
}

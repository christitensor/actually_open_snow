import Link from "next/link";
import SkiMap from "@/components/map/SkiMap";
import FavoritesList from "@/components/location/FavoritesList";
import { resorts } from "@/data/resorts";
import { webcams } from "@/data/webcams";

// Phase 1 regional scope (TRACE_MATRIX.md): Northern Utah & Southeast Idaho.
// Centered roughly on the Wasatch Front.
const REGION_CENTER: [number, number] = [-111.75, 41.2];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold">Actually Open Snow</h1>
        <p className="text-sm text-gray-500">
          Open-data snow forecasts for Northern Utah & Southeast Idaho — pick a resort, or drop a pin anywhere for backcountry conditions.
        </p>
      </header>

      <section className="h-[60vh] min-h-[400px] overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
        <SkiMap resorts={resorts} webcams={webcams} center={REGION_CENTER} zoom={8} />
      </section>
      <p className="-mt-4 text-xs text-gray-400">
        Blue pins are resorts, orange pins are webcams — click either for details, or click anywhere else on the map to drop a backcountry pin.
      </p>

      <div className="grid gap-6 sm:grid-cols-2">
        <section>
          <h2 className="mb-2 font-semibold">Resorts</h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-1">
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

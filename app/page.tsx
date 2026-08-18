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
    <div className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted-foreground">
          Pick a resort, or drop a pin anywhere for backcountry conditions.
        </p>
        <MyLocationButton />
      </div>

      {/* Below lg: map, then resort/backcountry lists, stacked full-width —
          unchanged mobile layout. At lg+: map pinned in a sticky left
          panel (the primary "pick a spot" interaction stays visible while
          scrolling), lists in a narrower right sidebar — the desktop
          pattern most map-first apps use instead of stretching a single
          mobile column across the whole screen. */}
      <div className="lg:flex lg:items-start lg:gap-6">
        <div className="lg:min-w-0 lg:flex-1">
          <section className="card h-[38vh] min-h-[280px] overflow-hidden sm:h-[55vh] lg:sticky lg:top-20 lg:h-[calc(100vh-7rem)]">
            <SkiMap resorts={resortsWithSnow} webcams={webcams} center={REGION_CENTER} zoom={8} />
          </section>
          <p className="-mt-4 text-xs text-muted-foreground lg:mt-2">
            Resort pins are colored by today&apos;s forecast snowfall (Powder Finder, est.), orange pins are webcams — click either for details, or click anywhere else on the map to drop a backcountry pin.
          </p>
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:mt-0 lg:w-96 lg:shrink-0 lg:grid-cols-1">
          <section>
            <h2 className="mb-2 font-bold tracking-tight">Resorts</h2>
            <ResortList resorts={resortsWithSnow} primaryIds={primaryResortIds} />
          </section>

          <section>
            <h2 className="mb-2 font-bold tracking-tight">Your backcountry spots</h2>
            <FavoritesList />
          </section>
        </div>
      </div>
    </div>
  );
}

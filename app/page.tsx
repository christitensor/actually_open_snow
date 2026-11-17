import { headers } from "next/headers";
import HomeExplorer from "@/components/location/HomeExplorer";
import { resorts } from "@/data/resorts";
import { webcams } from "@/data/webcams";
import { getGridSnowSummaryIn } from "@/lib/data-sources/open-meteo";
import { getMeasuredSnowNearPoints } from "@/lib/data-sources/snotel";
import { withTimeout } from "@/lib/util/with-timeout";
import { pickDefaultState } from "@/lib/resort-states";

// Resorts now span ~500 mi around Salt Lake City (data/resorts.json). The
// map's first frame is the default state's resorts (HomeExplorer fits to
// them); this is only the center before that, and the no-resorts fallback.
const REGION_CENTER: [number, number] = [-111.75, 41.2];

/**
 * The visitor's rough location from the host's IP geolocation headers
 * (Vercel sets these on every request; absent locally, where we fall back
 * to Utah). Region is the ISO 3166-2 subdivision, i.e. the US state code.
 */
async function viewerFromHeaders() {
  const h = await headers();
  const num = (k: string) => {
    const v = Number.parseFloat(h.get(k) ?? "");
    return Number.isFinite(v) ? v : null;
  };
  const country = h.get("x-vercel-ip-country");
  const lat = num("x-vercel-ip-latitude");
  const lon = num("x-vercel-ip-longitude");
  return {
    region: country === "US" ? h.get("x-vercel-ip-country-region") : null,
    lat,
    lon,
    origin: lat != null && lon != null ? { lat, lon } : null,
  };
}

export default async function Home() {
  const viewer = await viewerFromHeaders();
  const defaultState = pickDefaultState(resorts, viewer);
  const inState = resorts.filter((r) => r.state === defaultState);
  const center: [number, number] = inState.length
    ? [inState.reduce((s, r) => s + r.lon, 0) / inState.length, inState.reduce((s, r) => s + r.lat, 0) / inState.length]
    : REGION_CENTER;
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
    state: r.state,
    lat: r.lat,
    lon: r.lon,
    snowfallTodayIn: snow[i]?.todayIn,
    last12hIn: snow[i]?.pastIn[0],
    last7dIn: snow[i]?.pastIn[1],
    measured: measured[i] ?? null,
  }));

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6">
      <HomeExplorer
        resorts={resortsWithSnow}
        webcams={webcams}
        center={center}
        fetchedAt={new Date().toISOString()}
        defaultState={defaultState}
        ipOrigin={viewer.origin}
      />
    </div>
  );
}

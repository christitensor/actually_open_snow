"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useFavorites } from "@/lib/favorites";
import { favoriteKey } from "@/lib/util/favorite-key";
import { useDragReorder } from "@/lib/use-drag-reorder";
import DragGrip from "@/components/DragGrip";
import MeasuredSnow from "@/components/location/MeasuredSnow";
import type { MeasuredSnowNearby } from "@/lib/data-sources/snotel";

interface QuickSnow {
  todayIn: number;
  last12hIn: number;
  last7dIn: number;
  measured: MeasuredSnowNearby | null;
}

function fmtIn(v: number | undefined): string {
  return v != null ? `${v.toFixed(1)}"` : "—";
}

function pointKey(lat: number, lon: number): string {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

// PERS-01/MAP-17: saved backcountry pins (resort favorites now live in
// ResortList's top section instead — see app/page.tsx).
export default function FavoritesList({ onGoToMap }: { onGoToMap?: () => void }) {
  const { favorites, toggleFavorite, reorderFavorites } = useFavorites();
  const savedSpots = favorites.filter((f) => f.source === "pin");
  const [stats, setStats] = useState<Record<string, QuickSnow>>({});

  // PERS-07: drag the ⋮⋮ grip to reorder — see lib/use-drag-reorder.ts.
  const drag = useDragReorder(savedSpots, favoriteKey, reorderFavorites);
  const spots = drag.ordered;

  // Unlike ResortList's server-fetched stats, pins aren't known until this
  // client component reads them from localStorage/the account API, so the
  // quick 12h/today/7d visual for them has to be a client-side fetch.
  // Sorted, so reordering (or a live drag) doesn't refetch the same points.
  const pointsKey = savedSpots.map((s) => pointKey(s.lat, s.lon)).sort().join("|");

  useEffect(() => {
    if (!pointsKey) return;
    (async () => {
      try {
        const res = await fetch(`/api/quick-snow?points=${encodeURIComponent(pointsKey)}`);
        if (!res.ok) return;
        const body = (await res.json()) as { results: (QuickSnow & { lat: number; lon: number })[] };
        const map: Record<string, QuickSnow> = {};
        for (const r of body.results) map[pointKey(r.lat, r.lon)] = r;
        setStats(map);
      } catch {
        // Best-effort — a failed fetch just leaves the stats blank ("—").
      }
    })();
  }, [pointsKey]);

  if (spots.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-3 px-6 py-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-2xl" aria-hidden="true">
          📍
        </span>
        <div>
          <p className="text-sm font-semibold">No backcountry spots saved yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Drop a pin on the map, then save and name it from that page.</p>
        </div>
        {onGoToMap && (
          <button onClick={onGoToMap} className="btn-primary mt-1">
            Drop a pin to save your first spot
          </button>
        )}
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {spots.map((f, i) => {
        const key = favoriteKey(f);
        const href = `/location/pin?lat=${f.lat}&lon=${f.lon}`;
        const s = stats[pointKey(f.lat, f.lon)];
        const dragging = key === drag.dragKey;
        return (
          <li
            key={key}
            ref={(el) => drag.registerRow(key, el)}
            className={`card px-4 py-3 text-sm transition-shadow ${dragging ? "relative z-10 scale-[1.02] shadow-lg ring-2 ring-primary/40" : ""}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                {spots.length > 1 && <DragGrip label={f.name} className="-ml-2" {...drag.gripProps(key, i)} />}
                <Link href={href} className="truncate font-medium hover:text-primary">
                  {f.name}
                </Link>
              </div>
              <button onClick={() => toggleFavorite(f)} className="btn-ghost !px-2 !py-1 text-xs">
                remove
              </button>
            </div>
            <div className={`mt-1.5 flex items-center gap-1.5 ${spots.length > 1 ? "pl-4" : ""}`}>
              <span className="pill bg-primary/10 text-primary">Today {fmtIn(s?.todayIn)}</span>
              <span className="pill bg-muted text-muted-foreground">12h {fmtIn(s?.last12hIn)}</span>
              <span className="pill bg-muted text-muted-foreground">7d {fmtIn(s?.last7dIn)}</span>
            </div>
            <MeasuredSnow m={s?.measured} className={spots.length > 1 ? "pl-4" : ""} />
          </li>
        );
      })}
    </ul>
  );
}

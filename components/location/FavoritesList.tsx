"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useFavorites } from "@/lib/favorites";

interface QuickSnow {
  todayIn: number;
  last12hIn: number;
  last7dIn: number;
}

function fmtIn(v: number | undefined): string {
  return v != null ? `${v.toFixed(1)}"` : "—";
}

function pointKey(lat: number, lon: number): string {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

// PERS-01/MAP-17: saved backcountry pins (resort favorites now live in
// ResortList's top section instead — see app/page.tsx).
export default function FavoritesList() {
  const { favorites, toggleFavorite } = useFavorites();
  const spots = favorites.filter((f) => f.source === "pin");
  const [stats, setStats] = useState<Record<string, QuickSnow>>({});

  // Unlike ResortList's server-fetched stats, pins aren't known until this
  // client component reads them from localStorage/the account API, so the
  // quick 12h/today/7d visual for them has to be a client-side fetch.
  const pointsKey = spots.map((s) => pointKey(s.lat, s.lon)).join("|");

  useEffect(() => {
    if (!pointsKey) return;
    (async () => {
      try {
        const res = await fetch(`/api/quick-snow?points=${encodeURIComponent(pointsKey)}`);
        if (!res.ok) return;
        const body = (await res.json()) as { results: { lat: number; lon: number; todayIn: number; last12hIn: number; last7dIn: number }[] };
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
      <p className="card px-4 py-3 text-sm text-muted-foreground">
        No spots saved yet — drop a pin on the map, then save and name it from that page.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {spots.map((f) => {
        const href = `/location/pin?lat=${f.lat}&lon=${f.lon}`;
        const s = stats[pointKey(f.lat, f.lon)];
        return (
          <li key={href} className="card px-4 py-3 text-sm">
            <div className="flex items-center justify-between">
              <Link href={href} className="font-medium hover:text-primary">
                {f.name}
              </Link>
              <button onClick={() => toggleFavorite(f)} className="btn-ghost !px-2 !py-1 text-xs">
                remove
              </button>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className="pill bg-primary/10 text-primary">Today {fmtIn(s?.todayIn)}</span>
              <span className="pill bg-muted text-muted-foreground">12h {fmtIn(s?.last12hIn)}</span>
              <span className="pill bg-muted text-muted-foreground">7d {fmtIn(s?.last7dIn)}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

"use client";

import Link from "next/link";
import { useFavorites } from "@/lib/favorites";

// PERS-01/MAP-17: saved backcountry pins (resort favorites now live in
// ResortList's top section instead — see app/page.tsx).
export default function FavoritesList() {
  const { favorites, toggleFavorite } = useFavorites();
  const spots = favorites.filter((f) => f.source === "pin");

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
        return (
          <li key={href} className="card flex items-center justify-between px-4 py-3 text-sm">
            <Link href={href} className="font-medium hover:text-primary">
              {f.name}
            </Link>
            <button onClick={() => toggleFavorite(f)} className="btn-ghost !px-2 !py-1 text-xs">
              remove
            </button>
          </li>
        );
      })}
    </ul>
  );
}

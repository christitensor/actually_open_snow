"use client";

import Link from "next/link";
import { useFavorites } from "@/lib/favorites";

// PERS-01/MAP-17: saved backcountry pins (resort favorites now live in
// ResortList's top section instead — see app/page.tsx).
export default function FavoritesList() {
  const { favorites, toggleFavorite } = useFavorites();
  const spots = favorites.filter((f) => f.source === "pin");

  if (spots.length === 0) {
    return <p className="text-sm text-gray-500">No spots saved yet — drop a pin on the map, then save and name it from that page.</p>;
  }

  return (
    <ul className="space-y-1">
      {spots.map((f) => {
        const href = `/location/pin?lat=${f.lat}&lon=${f.lon}`;
        return (
          <li key={href} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-gray-800">
            <Link href={href} className="font-medium hover:underline">
              {f.name}
            </Link>
            <button onClick={() => toggleFavorite(f)} className="text-xs text-gray-400 hover:text-gray-600">
              remove
            </button>
          </li>
        );
      })}
    </ul>
  );
}

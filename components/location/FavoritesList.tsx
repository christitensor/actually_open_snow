"use client";

import Link from "next/link";
import { useFavorites } from "@/lib/favorites";

// PERS-02-adjacent: shows saved favorites (resorts or backcountry pins) on
// the landing page for quick access.
export default function FavoritesList() {
  const { favorites, toggleFavorite } = useFavorites();

  if (favorites.length === 0) {
    return <p className="text-sm text-gray-500">No favorites yet — star a resort or drop a backcountry pin to save it here.</p>;
  }

  return (
    <ul className="space-y-1">
      {favorites.map((f) => {
        const href = f.source === "resort" ? `/location/${f.resortId}` : `/location/pin?lat=${f.lat}&lon=${f.lon}`;
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

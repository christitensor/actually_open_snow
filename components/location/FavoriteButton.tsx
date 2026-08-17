"use client";

import { useFavorites } from "@/lib/favorites";
import type { Location } from "@/lib/models/types";

export default function FavoriteButton({ location }: { location: Location }) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const active = isFavorite(location);

  return (
    <button
      onClick={() => toggleFavorite(location)}
      className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
        active
          ? "border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
          : "border-gray-300 text-gray-600 hover:border-gray-400 dark:border-gray-700 dark:text-gray-300"
      }`}
    >
      {active ? "★ Favorited" : "☆ Add to favorites"}
    </button>
  );
}

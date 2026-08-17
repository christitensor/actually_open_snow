"use client";

import { useState } from "react";
import { useFavorites } from "@/lib/favorites";
import type { Location } from "@/lib/models/types";

// Resorts: a plain star toggle. Backcountry pins: prompts for a name
// first (e.g. "West Bowl") so saved spots are recognizable later instead
// of all showing up as "Custom Pin".
export default function FavoriteButton({ location }: { location: Location }) {
  const { favorites, isFavorite, toggleFavorite } = useFavorites();
  const active = isFavorite(location);
  const [name, setName] = useState("");

  if (location.source === "resort") {
    return (
      <button
        onClick={() => toggleFavorite(location)}
        className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
          active
            ? "border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
            : "border-gray-300 text-gray-600 hover:border-gray-400 dark:border-gray-700 dark:text-gray-300"
        }`}
      >
        {active ? "★ In your resorts" : "☆ Add to your resorts"}
      </button>
    );
  }

  if (active) {
    const saved = favorites.find(
      (f) => f.source === "pin" && f.lat.toFixed(4) === location.lat.toFixed(4) && f.lon.toFixed(4) === location.lon.toFixed(4)
    );
    return (
      <div className="flex items-center gap-2">
        <span className="rounded-full border border-amber-500 bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          ★ Saved as &quot;{saved?.name ?? location.name}&quot;
        </span>
        <button onClick={() => toggleFavorite(location)} className="text-xs text-gray-400 hover:text-gray-600">
          remove
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name this spot (optional)"
        className="rounded-lg border border-gray-300 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900"
      />
      <button
        onClick={() => toggleFavorite({ ...location, name: name.trim() || location.name })}
        className="shrink-0 rounded-full border border-gray-300 px-3 py-1 text-sm font-medium text-gray-600 hover:border-gray-400 dark:border-gray-700 dark:text-gray-300"
      >
        💾 Save spot
      </button>
    </div>
  );
}

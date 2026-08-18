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
      <button onClick={() => toggleFavorite(location)} className={active ? "btn-primary bg-accent" : "btn-secondary"}>
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
        <span className="pill bg-accent text-accent-foreground">★ Saved as &quot;{saved?.name ?? location.name}&quot;</span>
        <button onClick={() => toggleFavorite(location)} className="btn-ghost !px-2 !py-1 text-xs">
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
        className="input"
      />
      <button onClick={() => toggleFavorite({ ...location, name: name.trim() || location.name })} className="btn-secondary shrink-0">
        Save spot
      </button>
    </div>
  );
}

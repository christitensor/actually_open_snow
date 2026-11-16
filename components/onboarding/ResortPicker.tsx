"use client";

import { useFavorites } from "@/lib/favorites";
import { resortToLocation, resorts } from "@/data/resorts";

// Star toggles for every resort, grouped by region. Starring here is the
// same as the ☆ on a resort card: starred resorts are "My resorts", the
// home page's default view. Used by the first-sign-in welcome and Settings.
export default function ResortPicker() {
  const { isFavorite, toggleFavorite } = useFavorites();
  const regions = [...new Set(resorts.map((r) => r.region))];
  return (
    <div className="space-y-3">
      {regions.map((region) => (
        <fieldset key={region}>
          <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{region}</legend>
          <div className="flex flex-wrap gap-2">
            {resorts
              .filter((r) => r.region === region)
              .map((r) => {
                const loc = resortToLocation(r);
                const on = isFavorite(loc);
                return (
                  <button
                    key={r.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleFavorite(loc)}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                      on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/60"
                    }`}
                  >
                    {on ? "★" : "☆"} {r.name}
                  </button>
                );
              })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

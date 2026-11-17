"use client";

import { useEffect } from "react";
import { useFavorites } from "@/lib/favorites";
import type { Location } from "@/lib/models/types";

// A backcountry pin's page is rendered on the server, which can't see the
// person's saved spots (they live in their account / browser). These
// components look the pin up among their favorites and use the saved name
// ("Tony Grove Lake") instead of "Custom Pin", however the page was
// reached, updating the moment the spot is saved. Matches the way
// FavoriteButton identifies a saved pin (lat/lon to 4 decimals, ~10 m).

/** The display name for a location: a saved pin's name, else its own name. */
export function useLocationName(location: Location): string {
  const { favorites } = useFavorites();
  if (location.source !== "pin") return location.name;
  const saved = favorites.find(
    (f) => f.source === "pin" && f.lat.toFixed(4) === location.lat.toFixed(4) && f.lon.toFixed(4) === location.lon.toFixed(4)
  );
  return saved?.name ?? location.name;
}

export default function LocationTitle({ location }: { location: Location }) {
  const name = useLocationName(location);

  // Keep the tab title in step. Next.js streams the page's metadata <title>
  // (into <body>, and possibly after this runs while forecast data is still
  // loading), which would overwrite ours, so re-apply it on any document
  // change for the first while after load, then stop watching.
  useEffect(() => {
    if (location.source !== "pin") return;
    const want = `${name} · Actually Open Snow`;
    const apply = () => {
      if (document.title !== want) document.title = want;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    const stop = setTimeout(() => observer.disconnect(), 20_000);
    return () => {
      clearTimeout(stop);
      observer.disconnect();
    };
  }, [name, location.source]);

  return <h1 className="text-2xl font-bold tracking-tight">{name}</h1>;
}

/** Server-written text that starts with the location's name (e.g. the conditions summary), with a saved pin's name swapped in. */
export function LocationNamedText({ location, text }: { location: Location; text: string }) {
  const name = useLocationName(location);
  return <>{name !== location.name && text.startsWith(location.name) ? name + text.slice(location.name.length) : text}</>;
}

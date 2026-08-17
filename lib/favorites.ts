"use client";

// PERS-01: favorites, local-only for now (no auth/DB yet — see
// ARCHITECTURE.md build order). Stores arbitrary lat/lon entries
// alongside resort IDs, per PERS-01's note that favorites must support
// backcountry pins, not just curated resorts.
//
// Uses useSyncExternalStore (the recommended pattern for subscribing to
// external mutable state like localStorage) rather than useState+useEffect,
// which avoids both a hydration-mismatch flash and same-tab update bugs.

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { Location } from "@/lib/models/types";

const STORAGE_KEY = "actually-open-snow:favorites";
const CHANGE_EVENT = "actually-open-snow:favorites-changed";

export type FavoriteLocation = Location & { savedAt: string };

function favoriteKey(loc: Location): string {
  return loc.source === "resort" ? `resort:${loc.resortId}` : `pin:${loc.lat.toFixed(4)},${loc.lon.toFixed(4)}`;
}

function readRaw(): string {
  if (typeof window === "undefined") return "[]";
  return window.localStorage.getItem(STORAGE_KEY) ?? "[]";
}

function writeFavorites(list: FavoriteLocation[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback); // cross-tab updates
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function getServerSnapshot() {
  return "[]";
}

export function useFavorites() {
  const raw = useSyncExternalStore(subscribe, readRaw, getServerSnapshot);

  const favorites: FavoriteLocation[] = useMemo(() => {
    try {
      return JSON.parse(raw) as FavoriteLocation[];
    } catch {
      return [];
    }
  }, [raw]);

  const isFavorite = useCallback(
    (loc: Location) => favorites.some((f) => favoriteKey(f) === favoriteKey(loc)),
    [favorites]
  );

  const toggleFavorite = useCallback((loc: Location) => {
    const current: FavoriteLocation[] = JSON.parse(readRaw());
    const key = favoriteKey(loc);
    const exists = current.some((f) => favoriteKey(f) === key);
    const next = exists
      ? current.filter((f) => favoriteKey(f) !== key)
      : [...current, { ...loc, savedAt: new Date().toISOString() }];
    writeFavorites(next);
  }, []);

  return { favorites, isFavorite, toggleFavorite };
}

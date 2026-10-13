"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import Link from "next/link";
import { useFavorites } from "@/lib/favorites";
import { favoriteKey } from "@/lib/util/favorite-key";
import type { FavoriteLocation } from "@/lib/models/types";

interface QuickSnow {
  todayIn: number;
  last12hIn: number;
  last7dIn: number;
}

function fmtIn(v: number | undefined): string {
  return v != null ? `${v.toFixed(1)}"` : "—";
}

function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function pointKey(lat: number, lon: number): string {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

// PERS-01/MAP-17: saved backcountry pins (resort favorites now live in
// ResortList's top section instead — see app/page.tsx).
export default function FavoritesList({ onGoToMap }: { onGoToMap?: () => void }) {
  const { favorites, toggleFavorite, reorderFavorites } = useFavorites();
  const savedSpots = favorites.filter((f) => f.source === "pin");
  const [stats, setStats] = useState<Record<string, QuickSnow>>({});

  // PERS-07 drag-to-reorder. While a drag is live, `dragOrder` is the
  // working order rendered in place of the saved one; it's committed via
  // reorderFavorites (localStorage or account) on release. Pointer events
  // cover mouse and touch alike; the grip has touch-action:none so a drag
  // on it doesn't scroll the page, while the rest of the row still does.
  // Move/up are listened for on window, not via pointer capture on the
  // grip: reordering moves the row's DOM node, which drops capture
  // mid-drag (and with it every later event on touch devices).
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dragOrder, setDragOrder] = useState<FavoriteLocation[] | null>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const spots = dragOrder ?? savedSpots;

  const latest = useRef({ dragOrder, savedSpots, reorderFavorites });
  useEffect(() => {
    latest.current = { dragOrder, savedSpots, reorderFavorites };
  });

  useEffect(() => {
    if (!dragKey) return;

    const onMove = (e: globalThis.PointerEvent) => {
      const order = latest.current.dragOrder;
      if (!order) return;
      const from = order.findIndex((f) => favoriteKey(f) === dragKey);
      // Target slot = how many other rows' midpoints the pointer is below.
      let to = 0;
      for (const f of order) {
        const k = favoriteKey(f);
        if (k === dragKey) continue;
        const rect = rowRefs.current.get(k)?.getBoundingClientRect();
        if (rect && e.clientY > rect.top + rect.height / 2) to++;
      }
      if (from !== -1 && to !== from) setDragOrder(moveItem(order, from, to));
    };

    const onEnd = () => {
      const { dragOrder: order, savedSpots: saved, reorderFavorites: commit } = latest.current;
      if (order && order.some((f, i) => favoriteKey(f) !== favoriteKey(saved[i] ?? f))) commit(order);
      setDragKey(null);
      setDragOrder(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
  }, [dragKey]);

  function onGripPointerDown(e: PointerEvent<HTMLButtonElement>, key: string) {
    e.preventDefault();
    setDragKey(key);
    setDragOrder(savedSpots);
  }

  function onGripKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const to = e.key === "ArrowUp" ? index - 1 : e.key === "ArrowDown" ? index + 1 : -1;
    if (to < 0 || to >= savedSpots.length) return;
    e.preventDefault();
    reorderFavorites(moveItem(savedSpots, index, to));
  }

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
      <div className="card flex flex-col items-center gap-3 px-6 py-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-2xl" aria-hidden="true">
          📍
        </span>
        <div>
          <p className="text-sm font-semibold">No backcountry spots saved yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Drop a pin on the map, then save and name it from that page.</p>
        </div>
        {onGoToMap && (
          <button onClick={onGoToMap} className="btn-primary mt-1">
            Drop a pin to save your first spot
          </button>
        )}
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {spots.map((f, i) => {
        const key = favoriteKey(f);
        const href = `/location/pin?lat=${f.lat}&lon=${f.lon}`;
        const s = stats[pointKey(f.lat, f.lon)];
        const dragging = key === dragKey;
        return (
          <li
            key={key}
            ref={(el) => {
              if (el) rowRefs.current.set(key, el);
              else rowRefs.current.delete(key);
            }}
            className={`card px-4 py-3 text-sm transition-shadow ${dragging ? "relative z-10 scale-[1.02] shadow-lg ring-2 ring-primary/40" : ""}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                {spots.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Reorder ${f.name} (drag, or use arrow keys)`}
                    title="Drag to reorder"
                    className="-ml-2 flex h-8 w-6 shrink-0 cursor-grab touch-none select-none items-center justify-center rounded text-muted-foreground hover:bg-muted active:cursor-grabbing"
                    onPointerDown={(e) => onGripPointerDown(e, key)}
                    onKeyDown={(e) => onGripKeyDown(e, i)}
                  >
                    <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
                      <circle cx="2" cy="3" r="1.5" />
                      <circle cx="8" cy="3" r="1.5" />
                      <circle cx="2" cy="8" r="1.5" />
                      <circle cx="8" cy="8" r="1.5" />
                      <circle cx="2" cy="13" r="1.5" />
                      <circle cx="8" cy="13" r="1.5" />
                    </svg>
                  </button>
                )}
                <Link href={href} className="truncate font-medium hover:text-primary">
                  {f.name}
                </Link>
              </div>
              <button onClick={() => toggleFavorite(f)} className="btn-ghost !px-2 !py-1 text-xs">
                remove
              </button>
            </div>
            <div className={`mt-1.5 flex items-center gap-1.5 ${spots.length > 1 ? "pl-4" : ""}`}>
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

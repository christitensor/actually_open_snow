"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { MeasuredSnowNearby } from "@/lib/data-sources/snotel";
import { useFavorites } from "@/lib/favorites";
import { useDragReorder } from "@/lib/use-drag-reorder";
import DragGrip from "@/components/DragGrip";
import MeasuredSnow from "@/components/location/MeasuredSnow";
import type { Location } from "@/lib/models/types";
import { usePreferences } from "@/lib/preferences/context";
import type { ResortSort } from "@/lib/preferences/schema";
import { milesFrom } from "@/lib/resort-states";

interface ResortRow {
  id: string;
  name: string;
  region: string;
  state: string;
  lat: number;
  lon: number;
  snowfallTodayIn?: number;
  last12hIn?: number;
  last7dIn?: number;
  measured?: MeasuredSnowNearby | null;
}

function toLocation(r: ResortRow): Location {
  return { lat: r.lat, lon: r.lon, source: "resort", resortId: r.id, name: r.name };
}

function bySnowDesc(a: ResortRow, b: ResortRow) {
  return (b.snowfallTodayIn ?? 0) - (a.snowfallTodayIn ?? 0);
}

// PERS-07: "Nearest" (default — closest to you first, see HomeExplorer's
// origin), "Most snow" ("where's it dumping"), or "My order" (starred
// resorts first, in the order you dragged them; only with 2+ stars).
// Saved with the account's view settings (PERS-08), so it follows you.
type SortMode = ResortSort;

function SortToggle({ mode, onChange, showMine }: { mode: SortMode; onChange: (m: SortMode) => void; showMine: boolean }) {
  const option = (value: SortMode, label: string) => (
    <button
      onClick={() => onChange(value)}
      aria-pressed={mode === value}
      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
        mode === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="inline-flex rounded-full bg-muted p-0.5" role="group" aria-label="Sort resorts">
      {option("near", "Nearest")}
      {option("snow", "Most snow")}
      {showMine && option("mine", "My order")}
    </div>
  );
}

function fmtMiles(mi: number): string {
  return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi).toLocaleString()} mi`;
}

function fmtIn(v: number | undefined): string {
  return v != null ? `${v.toFixed(1)}"` : "—";
}

// Quick forecast visual: today / 12h / 7d at a glance, so a storm that
// already dropped snow overnight (12h) or over the week (7d) isn't hidden
// behind a single "today's forecast" number the way the old one-pill
// layout was.
function SnowStats({ r }: { r: ResortRow }) {
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <span className="pill bg-primary/10 text-primary">Today {fmtIn(r.snowfallTodayIn)}</span>
      <span className="pill bg-muted text-muted-foreground">12h {fmtIn(r.last12hIn)}</span>
      <span className="pill bg-muted text-muted-foreground">7d {fmtIn(r.last7dIn)}</span>
    </div>
  );
}

function Row({
  r,
  active,
  onHover,
  onRef,
  grip,
  dragging = false,
  distanceMi,
}: {
  r: ResortRow;
  distanceMi?: number;
  active: boolean;
  onHover: (id: string | null) => void;
  onRef: (id: string, el: HTMLLIElement | null) => void;
  grip?: ReactNode;
  dragging?: boolean;
}) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const starred = isFavorite(toLocation(r));

  return (
    <li
      ref={(el) => onRef(r.id, el)}
      className={`relative ${dragging ? "z-10" : ""}`}
      onMouseEnter={() => onHover(r.id)}
      onMouseLeave={() => onHover(null)}
    >
      <Link
        href={`/location/${r.id}`}
        className={`card block py-3 pr-11 transition hover:shadow-md hover:-translate-y-0.5 ${grip ? "pl-9" : "pl-4"} ${
          active ? "border-primary ring-2 ring-primary/30" : ""
        } ${dragging ? "scale-[1.02] shadow-lg ring-2 ring-primary/40" : ""}`}
      >
        <div className="text-base font-bold tracking-tight">{r.name}</div>
        <div className="text-xs font-normal text-muted-foreground">
          {r.region}
          {distanceMi != null && <> · {fmtMiles(distanceMi)}</>}
        </div>
        <SnowStats r={r} />
        <MeasuredSnow m={r.measured} />
      </Link>
      {grip && <div className="absolute top-1/2 left-1.5 -translate-y-1/2">{grip}</div>}
      <button
        onClick={(e) => {
          e.preventDefault();
          toggleFavorite(toLocation(r));
        }}
        aria-label={starred ? "Remove from your resorts" : "Add to your resorts"}
        className={`absolute top-2.5 right-2.5 flex h-7 w-7 items-center justify-center rounded-full text-base transition ${
          starred ? "text-accent" : "text-muted-foreground/60 hover:text-accent"
        }`}
      >
        {starred ? "★" : "☆"}
      </button>
    </li>
  );
}

function UpdatedLabel({ fetchedAt }: { fetchedAt?: string }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!fetchedAt) return;
    const update = () => {
      const mins = Math.round((Date.now() - new Date(fetchedAt).getTime()) / 60000);
      setLabel(mins <= 0 ? "Updated just now" : mins === 1 ? "Updated 1 min ago" : mins < 60 ? `Updated ${mins} min ago` : "Updated over an hour ago");
    };
    update();
    const interval = setInterval(update, 30_000);
    return () => clearInterval(interval);
  }, [fetchedAt]);

  // Rendered client-side only (Date.now()-derived), so it never disagrees
  // with the server-rendered markup during hydration.
  if (!label) return null;
  return <span>{label}</span>;
}

// Puts primaryResortIds (data/resorts.ts) plus anything starred at the
// top, always visible; everything else collapses behind a toggle. Star a
// resort here to pin it to the top permanently, alongside the hardcoded
// defaults — both feed the same set.
export default function ResortList({
  resorts,
  primaryIds,
  favoritesOnly = false,
  hoveredId = null,
  selectedId = null,
  onHover,
  fetchedAt,
  onExpandedChange,
  expandLabel,
  origin,
  controls,
  footnote,
}: {
  resorts: ResortRow[];
  primaryIds: string[];
  favoritesOnly?: boolean;
  hoveredId?: string | null;
  selectedId?: string | null;
  onHover?: (id: string | null) => void;
  fetchedAt?: string;
  /** Told when the collapsed remainder is opened/closed (the home map shows those pins only while open). */
  onExpandedChange?: (expanded: boolean) => void;
  /** Label for the collapsed-remainder button (default "Show all N resorts"). */
  expandLabel?: string;
  /** Where distances are measured from; "Nearest" sorts by it. */
  origin?: { lat: number; lon: number } | null;
  /** Rendered at the start of the controls row (the home page's state dropdown). */
  controls?: ReactNode;
  /** Small print under the controls (e.g. where distances are measured from). */
  footnote?: ReactNode;
}) {
  const { favorites, isFavorite, reorderFavorites } = useFavorites();
  const [showAll, setShowAll] = useState(false);
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const { prefs, update } = usePreferences();
  const distances = new Map(origin ? resorts.map((r) => [r.id, milesFrom(origin, r)] as const) : []);
  const byNear = (a: ResortRow, b: ResortRow) => (distances.get(a.id) ?? 0) - (distances.get(b.id) ?? 0);

  const visible = favoritesOnly ? resorts.filter((r) => isFavorite(toLocation(r))) : resorts;

  // "My order": starred resorts first in your saved order (draggable),
  // then the non-starred defaults by snow as before.
  const starredOrder = favorites.flatMap((f) => (f.source === "resort" && f.resortId ? [f.resortId] : []));
  const starred = starredOrder.flatMap((id) => visible.filter((r) => r.id === id));
  const drag = useDragReorder(starred, (r) => r.id, (ordered) => reorderFavorites(ordered.map(toLocation)));
  const canReorder = starred.length >= 2;
  // "My order" saved on a device that has since dropped below 2 stars falls back to nearest.
  const sortMode: SortMode = prefs.resortOrder === "mine" && !canReorder ? "near" : prefs.resortOrder;
  const compare = sortMode === "snow" || !origin ? bySnowDesc : byNear;
  const topSorted = visible.filter((r) => primaryIds.includes(r.id) || isFavorite(toLocation(r))).sort(compare);
  const myOrder = sortMode === "mine";
  const top = myOrder ? [...drag.ordered, ...topSorted.filter((r) => !starredOrder.includes(r.id))] : topSorted;
  const topIds = new Set(top.map((r) => r.id));
  const rest = visible.filter((r) => !topIds.has(r.id)).sort(compare);

  // A pin clicked on the map might belong to a resort collapsed behind
  // "Show all" — derived (not stored) so selecting one expands the list
  // without needing an effect just to flip a boolean in response to a prop.
  const expanded = showAll || (selectedId != null && rest.some((r) => r.id === selectedId));

  useEffect(() => {
    onExpandedChange?.(expanded);
  }, [expanded, onExpandedChange]);

  useEffect(() => {
    if (!selectedId) return;
    rowRefs.current.get(selectedId)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedId]);

  const handleRef = (id: string, el: HTMLLIElement | null) => {
    if (el) rowRefs.current.set(id, el);
    else rowRefs.current.delete(id);
    drag.registerRow(id, el);
  };

  if (favoritesOnly && top.length === 0 && rest.length === 0) {
    return <p className="card px-4 py-3 text-sm text-muted-foreground">No favorites yet — star a resort to pin it here.</p>;
  }

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        {controls}
        <div className="ml-auto">
          <SortToggle mode={sortMode} onChange={(m) => update({ resortOrder: m })} showMine={canReorder} />
        </div>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        <UpdatedLabel fetchedAt={fetchedAt} />
        {footnote}
      </div>
      <ul className="space-y-2">
        {top.map((r) => {
          const starredIndex = myOrder ? drag.ordered.findIndex((o) => o.id === r.id) : -1;
          return (
            <Row
              key={r.id}
              r={r}
              active={r.id === hoveredId || r.id === selectedId}
              onHover={(id) => onHover?.(id)}
              onRef={handleRef}
              distanceMi={distances.get(r.id)}
              dragging={r.id === drag.dragKey}
              grip={starredIndex !== -1 ? <DragGrip label={r.name} {...drag.gripProps(r.id, starredIndex)} /> : undefined}
            />
          );
        })}
      </ul>

      {rest.length > 0 && (
        <>
          <button onClick={() => setShowAll((v) => !v)} className="btn-ghost mt-3 !px-0">
            {expanded ? "Hide" : (expandLabel ?? `Show all ${resorts.length} resorts`)} {expanded ? "▲" : "▼"}
          </button>
          {/* grid-rows 0fr→1fr is a CSS-only way to animate to "however tall
              the content turns out to be" without measuring pixel heights
              in JS — the 0fr track collapses to zero, 1fr grows to fit. */}
          <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
            <div className="overflow-hidden">
              <ul className="mt-2 space-y-2">
                {rest.map((r) => (
                  <Row
                    key={r.id}
                    r={r}
                    distanceMi={distances.get(r.id)}
                    active={r.id === hoveredId || r.id === selectedId}
                    onHover={(id) => onHover?.(id)}
                    onRef={handleRef}
                  />
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

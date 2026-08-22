"use client";

import { useState } from "react";
import Link from "next/link";
import { useFavorites } from "@/lib/favorites";
import type { Location } from "@/lib/models/types";

interface ResortRow {
  id: string;
  name: string;
  region: string;
  lat: number;
  lon: number;
  snowfallTodayIn?: number;
  last12hIn?: number;
  last7dIn?: number;
}

function toLocation(r: ResortRow): Location {
  return { lat: r.lat, lon: r.lon, source: "resort", resortId: r.id, name: r.name };
}

function bySnowDesc(a: ResortRow, b: ResortRow) {
  return (b.snowfallTodayIn ?? 0) - (a.snowfallTodayIn ?? 0);
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
    <div className="mt-1.5 flex items-center gap-1.5">
      <span className="pill bg-primary/10 text-primary">Today {fmtIn(r.snowfallTodayIn)}</span>
      <span className="pill bg-muted text-muted-foreground">12h {fmtIn(r.last12hIn)}</span>
      <span className="pill bg-muted text-muted-foreground">7d {fmtIn(r.last7dIn)}</span>
    </div>
  );
}

function Row({ r }: { r: ResortRow }) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const starred = isFavorite(toLocation(r));

  return (
    <li className="flex items-center gap-2">
      <Link href={`/location/${r.id}`} className="card flex-1 px-4 py-3 text-sm font-medium transition hover:border-primary">
        <span>
          {r.name}
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">{r.region}</span>
        </span>
        <SnowStats r={r} />
      </Link>
      <button
        onClick={() => toggleFavorite(toLocation(r))}
        aria-label={starred ? "Remove from your resorts" : "Add to your resorts"}
        className={`card shrink-0 px-2.5 py-3 text-base transition ${starred ? "text-accent" : "text-muted-foreground hover:text-accent"}`}
      >
        {starred ? "★" : "☆"}
      </button>
    </li>
  );
}

// Puts primaryResortIds (data/resorts.ts) plus anything starred at the
// top, always visible; everything else collapses behind a toggle. Star a
// resort here to pin it to the top permanently, alongside the hardcoded
// defaults — both feed the same set.
export default function ResortList({ resorts, primaryIds }: { resorts: ResortRow[]; primaryIds: string[] }) {
  const { isFavorite } = useFavorites();
  const [showAll, setShowAll] = useState(false);

  const top = resorts
    .filter((r) => primaryIds.includes(r.id) || isFavorite(toLocation(r)))
    .sort(bySnowDesc);
  const topIds = new Set(top.map((r) => r.id));
  const rest = resorts.filter((r) => !topIds.has(r.id)).sort(bySnowDesc);

  return (
    <div>
      <ul className="space-y-2">
        {top.map((r) => (
          <Row key={r.id} r={r} />
        ))}
      </ul>

      {rest.length > 0 && (
        <>
          <button onClick={() => setShowAll((v) => !v)} className="btn-ghost mt-3 !px-0">
            {showAll ? "Hide" : `Show all ${resorts.length} resorts`} {showAll ? "▲" : "▼"}
          </button>
          {showAll && (
            <ul className="mt-2 space-y-2">
              {rest.map((r) => (
                <Row key={r.id} r={r} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

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
}

function toLocation(r: ResortRow): Location {
  return { lat: r.lat, lon: r.lon, source: "resort", resortId: r.id, name: r.name };
}

function bySnowDesc(a: ResortRow, b: ResortRow) {
  return (b.snowfallTodayIn ?? 0) - (a.snowfallTodayIn ?? 0);
}

function Row({ r }: { r: ResortRow }) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const starred = isFavorite(toLocation(r));

  return (
    <li className="flex items-center gap-2">
      <Link
        href={`/location/${r.id}`}
        className="flex flex-1 items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium hover:border-blue-400 hover:text-blue-600 dark:border-gray-800"
      >
        <span>
          {r.name}
          <span className="ml-1 text-xs font-normal text-gray-400">{r.region}</span>
        </span>
        <span className="text-xs font-semibold text-gray-500">
          {r.snowfallTodayIn != null ? `${r.snowfallTodayIn.toFixed(1)}"` : "—"}
        </span>
      </Link>
      <button
        onClick={() => toggleFavorite(toLocation(r))}
        aria-label={starred ? "Remove from your resorts" : "Add to your resorts"}
        className={`shrink-0 rounded-lg border px-2 py-2 text-sm ${
          starred
            ? "border-amber-500 bg-amber-50 text-amber-600 dark:bg-amber-950"
            : "border-gray-200 text-gray-300 hover:text-gray-500 dark:border-gray-800"
        }`}
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
      <ul className="space-y-1">
        {top.map((r) => (
          <Row key={r.id} r={r} />
        ))}
      </ul>

      {rest.length > 0 && (
        <>
          <button
            onClick={() => setShowAll((v) => !v)}
            className="mt-3 text-xs font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            {showAll ? "Hide" : `Show all ${resorts.length} resorts`} {showAll ? "▲" : "▼"}
          </button>
          {showAll && (
            <ul className="mt-2 space-y-1">
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

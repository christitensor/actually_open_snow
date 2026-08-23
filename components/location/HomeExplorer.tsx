"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import SkiMap, { type SkiMapHandle } from "@/components/map/SkiMap";
import ResortList from "@/components/location/ResortList";
import FavoritesList from "@/components/location/FavoritesList";
import MyLocationButton from "@/components/location/MyLocationButton";
import type { Webcam } from "@/lib/models/types";

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

function FilterPill({ active, onClick, children, href }: { active?: boolean; onClick?: () => void; children: React.ReactNode; href?: string }) {
  const cls = `shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${
    active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:border-primary hover:text-primary"
  }`;
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

// Split-screen "Airbnb pattern" home explorer: resort list is the primary,
// independently-scrolling surface (left on desktop); the map is a pinned
// companion (right), not the thing you have to scroll past to reach data.
// On narrow screens there's no room for both side by side, so a Map/List
// pill swaps between them instead of stacking the whole map above the list.
export default function HomeExplorer({
  resorts,
  webcams,
  primaryIds,
  center,
  fetchedAt,
}: {
  resorts: ResortRow[];
  webcams: Webcam[];
  primaryIds: string[];
  center: [number, number];
  fetchedAt: string;
}) {
  const skiMapRef = useRef<SkiMapHandle>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"map" | "list">("list");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [snowOverlayOn, setSnowOverlayOn] = useState(false);
  const [obsOn, setObsOn] = useState(false);

  const handleResortHover = useCallback((id: string | null) => setHoveredId(id), []);
  const handleResortSelect = useCallback((id: string) => {
    setSelectedId(id);
    // A pin tapped while the map panel is the only thing on screen (mobile)
    // has nowhere to show the highlighted card unless the view switches —
    // matches tapping a pin on Airbnb's mobile map, which surfaces the listing.
    setMobileView("list");
  }, []);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted-foreground">Pick a resort, or drop a pin anywhere for backcountry conditions.</p>
        <MyLocationButton />
      </div>

      {/* Surfaces the map's snow/avalanche-observations toggles (otherwise
          buried in the map's own bottom-left controls) plus list-level
          filters, in one discoverable row. "Open now" was considered and
          dropped — this app has no resort operating-status data source to
          back it with. */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        <FilterPill active={snowOverlayOn} onClick={() => skiMapRef.current?.toggleSnowOverlay()}>
          Powder today
        </FilterPill>
        <FilterPill active={obsOn} onClick={() => skiMapRef.current?.toggleAvalancheObservations()}>
          Backcountry
        </FilterPill>
        <FilterPill active={favoritesOnly} onClick={() => setFavoritesOnly((v) => !v)}>
          Favorites
        </FilterPill>
        <FilterPill href="/webcams">Webcams</FilterPill>
      </div>

      {/* Mobile/tablet: one panel at a time behind a Map/List toggle, so
          getting to resort data doesn't mean scrolling past the whole map
          first. Desktop (lg+): both panels side by side, list primary
          (left, independently scrolling), map pinned (right) — swapped
          from the map-first layout this replaced. */}
      <div className="mb-4 flex gap-1 rounded-full border border-border bg-card p-1 text-sm font-semibold lg:hidden">
        {(["list", "map"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setMobileView(v)}
            className={`flex-1 rounded-full py-1.5 capitalize transition ${
              mobileView === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      {/* One real instance of each panel — critically, one real MapLibre
          instance — repositioned by CSS rather than mounted twice for
          "mobile" and "desktop" layouts. `hidden`/`lg:block` toggles
          visibility per viewport without ever unmounting either panel, so
          switching the mobile Map/List pill doesn't reinitialize the map;
          the ResizeObserver SkiMap already has (for sticky-sidebar layouts
          not having a final size at mount) is exactly what makes the map
          redraw correctly the moment its container goes from hidden
          (0×0) to visible on a view switch. */}
      <div className="lg:flex lg:items-start lg:gap-6">
        <div className={`lg:min-w-0 lg:flex-1 ${mobileView === "map" ? "hidden lg:block" : ""}`}>
          <div className="space-y-6">
            <section>
              <h2 className="mb-2 font-bold tracking-tight">Resorts</h2>
              <ResortList
                resorts={resorts}
                primaryIds={primaryIds}
                favoritesOnly={favoritesOnly}
                hoveredId={hoveredId}
                selectedId={selectedId}
                onHover={handleResortHover}
                fetchedAt={fetchedAt}
              />
            </section>

            <section>
              <h2 className="mb-2 font-bold tracking-tight">Your backcountry spots</h2>
              <FavoritesList onGoToMap={() => setMobileView("map")} />
            </section>
          </div>
        </div>

        <div className={`lg:w-[440px] lg:shrink-0 xl:w-[500px] ${mobileView === "list" ? "hidden lg:block" : ""}`}>
          <section className="card h-[38vh] min-h-[280px] overflow-hidden sm:h-[55vh] lg:sticky lg:top-20 lg:h-[calc(100vh-7rem)]">
            <SkiMap
              ref={skiMapRef}
              resorts={resorts}
              webcams={webcams}
              center={center}
              zoom={8}
              hoveredResortId={hoveredId}
              selectedResortId={selectedId}
              onResortHover={handleResortHover}
              onResortSelect={handleResortSelect}
              onSnowOverlayChange={setSnowOverlayOn}
              onAvalancheObservationsChange={setObsOn}
            />
          </section>
          <p className="mt-2 text-xs text-muted-foreground">
            Resort pins are colored by today&apos;s forecast snowfall (Powder Finder, est.), orange pins are webcams — click either for details, or click
            anywhere else on the map to drop a backcountry pin.
          </p>
        </div>
      </div>
    </div>
  );
}

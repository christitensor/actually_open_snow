"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { MeasuredSnowNearby } from "@/lib/data-sources/snotel";
import SkiMap, { type SkiMapHandle } from "@/components/map/SkiMap";
import ResortList from "@/components/location/ResortList";
import FavoritesList from "@/components/location/FavoritesList";
import { usePreferences } from "@/lib/preferences/context";
import { useFavorites } from "@/lib/favorites";
import { useAuth } from "@/lib/auth";
import { FAVORITES_CHANGE_EVENT } from "@/lib/favorites-storage";
import { openWelcome } from "@/components/onboarding/Welcome";
import MyLocationButton from "@/components/location/MyLocationButton";
import type { Webcam } from "@/lib/models/types";
import { ALL_STATES, FALLBACK_ORIGIN, stateName, type Origin } from "@/lib/resort-states";
import { readDeviceOrigin, requestDeviceOrigin } from "@/lib/device-origin";

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

function StateSelect({
  value,
  counts,
  total,
  onChange,
}: {
  value: string;
  counts: [string, number][];
  total: number;
  onChange: (state: string) => void;
}) {
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">Show resorts in</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-full border border-border bg-card py-1.5 pr-8 pl-3.5 text-sm font-semibold text-foreground transition hover:border-primary focus:border-primary focus:outline-none"
      >
        {counts.map(([code, n]) => (
          <option key={code} value={code}>
            {stateName(code)} ({n})
          </option>
        ))}
        <option value={ALL_STATES}>All states ({total})</option>
      </select>
      <span aria-hidden className="pointer-events-none absolute right-3 text-xs text-muted-foreground">
        ▼
      </span>
    </label>
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
  center,
  fetchedAt,
  defaultState,
  ipOrigin,
}: {
  resorts: ResortRow[];
  webcams: Webcam[];
  center: [number, number];
  fetchedAt: string;
  /** The viewer's state, from their IP on the server (see app/page.tsx) — the list's starting filter. */
  defaultState: string;
  /** Approximate viewer location from their IP, when the host provides it. */
  ipOrigin: { lat: number; lon: number } | null;
}) {
  const skiMapRef = useRef<SkiMapHandle>(null);
  // PERS-08 "My resorts" = your starred resorts. Before you star any, every
  // resort is shown. Once you star some, those are your home view (list
  // and map) and the rest sit behind "Browse all resorts".
  const { prefs, ready: prefsReady, accountLoaded, update: updatePrefs } = usePreferences();
  const { favorites, isFavorite, toggleFavorite } = useFavorites();
  const starredIds = favorites.flatMap((f) => (f.source === "resort" && f.resortId ? [f.resortId] : []));
  const hasStarred = starredIds.length > 0;
  const [browsingAll, setBrowsingAll] = useState(false);

  // By state: the dropdown starts on the viewer's own state (or the one
  // nearest them) until they pick one, and that pick is saved.
  const selectedState = prefs.resortState ?? defaultState;
  const stateResorts = selectedState === ALL_STATES ? resorts : resorts.filter((r) => r.state === selectedState);
  const stateCounts = Object.entries(
    resorts.reduce<Record<string, number>>((acc, r) => ((acc[r.state] = (acc[r.state] ?? 0) + 1), acc), {})
  ).sort(([a], [b]) => stateName(a).localeCompare(stateName(b)));
  const starredResorts = resorts.filter((r) => starredIds.includes(r.id));
  // No stars: the picked state's resorts, all on top. Stars: they're on top
  // (from any state; ResortList adds favorites itself), with the picked
  // state's other resorts collapsed behind "Browse".
  const listResorts = hasStarred ? [...starredResorts, ...stateResorts.filter((r) => !starredIds.includes(r.id))] : stateResorts;
  const shownPrimaryIds = hasStarred ? [] : stateResorts.map((r) => r.id);
  const shownResorts = !hasStarred ? stateResorts : browsingAll ? listResorts : starredResorts;
  const browseCount = listResorts.length - starredResorts.length;

  // Distances: the device's precise location once shared, else the IP's
  // rough one, else Salt Lake City. Read after mount (localStorage), so the
  // server-rendered list and the first client render agree.
  const [deviceOrigin, setDeviceOrigin] = useState<{ lat: number; lon: number } | null>(null);
  const [locating, setLocating] = useState(false);
  useEffect(() => {
    const cached = readDeviceOrigin();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of a device-only value
    if (cached) setDeviceOrigin(cached);
    // Already allowed (e.g. via "My location"): refresh quietly, no prompt.
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((p) => (p.state === "granted" ? requestDeviceOrigin() : null))
      .then((o) => o && setDeviceOrigin(o))
      .catch(() => {});
  }, []);
  const origin: Origin = deviceOrigin
    ? { ...deviceOrigin, source: "gps" }
    : ipOrigin
      ? { ...ipOrigin, source: "ip" }
      : { lat: FALLBACK_ORIGIN.lat, lon: FALLBACK_ORIGIN.lon, source: "fallback" };
  const usePreciseLocation = async () => {
    setLocating(true);
    const o = await requestDeviceOrigin();
    setLocating(false);
    if (o) setDeviceOrigin(o);
  };

  // Frame the map on the picked state (instantly on first load, animated after).
  const firstFit = useRef(true);
  const fitKey = hasStarred && !browsingAll ? `starred:${starredIds.join(",")}` : `state:${selectedState}`;
  useEffect(() => {
    skiMapRef.current?.fitToPoints(shownResorts, { animate: !firstFit.current });
    firstFit.current = false;
    // Re-frame only when the state or starred set changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  // One-time migration from v1's separate "My resorts" checklist: those become stars.
  // Signed in, it uses the add-only import endpoint (never un-stars anything,
  // even if the server's favorites haven't loaded into this page yet).
  const { status } = useAuth();
  useEffect(() => {
    const legacy = prefs.myResorts;
    if (!prefsReady || !legacy || status === "loading") return;
    if (status === "signed-in" && !accountLoaded) return;
    const locs = legacy.flatMap((id) => {
      const r = resorts.find((x) => x.id === id);
      return r ? [{ lat: r.lat, lon: r.lon, source: "resort" as const, resortId: r.id, name: r.name, savedAt: new Date().toISOString() }] : [];
    });
    updatePrefs({ myResorts: null });
    if (status === "signed-in") {
      fetch("/api/favorites/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ favorites: locs }) })
        .then(() => window.dispatchEvent(new Event(FAVORITES_CHANGE_EVENT)))
        .catch(() => {});
    } else {
      for (const loc of locs) if (!isFavorite(loc)) toggleFavorite(loc);
    }
    // Runs once per legacy value, not on every favorites change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsReady, prefs.myResorts, status, accountLoaded]);
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
          first. Tablet/desktop (md+, which includes an unfolded iPhone Duo in
          landscape): both panels side by side, list primary
          (left, independently scrolling), map pinned (right) — swapped
          from the map-first layout this replaced. */}
      <div className="mb-4 flex gap-1 rounded-full border border-border bg-card p-1 text-sm font-semibold md:hidden">
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
          "mobile" and "desktop" layouts. `hidden`/`md:block` toggles
          visibility per viewport without ever unmounting either panel, so
          switching the mobile Map/List pill doesn't reinitialize the map;
          the ResizeObserver SkiMap already has (for sticky-sidebar layouts
          not having a final size at mount) is exactly what makes the map
          redraw correctly the moment its container goes from hidden
          (0×0) to visible on a view switch. */}
      <div className="md:flex md:items-start md:gap-6">
        <div className={`md:min-w-0 md:flex-1 ${mobileView === "map" ? "hidden md:block" : ""}`}>
          <div className="space-y-6">
            <section>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h2 className="font-bold tracking-tight">{hasStarred ? "My resorts" : "Resorts"}</h2>
                {hasStarred ? (
                  <Link href="/settings#resorts" className="text-xs font-medium text-primary hover:underline">
                    {starredIds.length} starred · Edit
                  </Link>
                ) : (
                  <span className="text-xs text-muted-foreground">Star ☆ a resort to make it yours</span>
                )}
              </div>
              <ResortList
                onExpandedChange={setBrowsingAll}
                expandLabel={
                  hasStarred
                    ? `Browse ${browseCount} more ${selectedState === ALL_STATES ? "resorts" : `in ${stateName(selectedState)}`}`
                    : undefined
                }
                origin={origin}
                controls={
                  <StateSelect
                    value={selectedState}
                    counts={stateCounts}
                    total={resorts.length}
                    onChange={(s) => updatePrefs({ resortState: s })}
                  />
                }
                footnote={
                  <span>
                    {origin.source === "gps"
                      ? "Distances from your location"
                      : origin.source === "ip"
                        ? "Distances from your approximate area"
                        : `Distances from ${FALLBACK_ORIGIN.label}`}
                    {origin.source !== "gps" && (
                      <>
                        {" · "}
                        <button onClick={usePreciseLocation} disabled={locating} className="font-medium text-primary hover:underline disabled:opacity-60">
                          {locating ? "Locating…" : "Use precise location"}
                        </button>
                      </>
                    )}
                  </span>
                }
                resorts={listResorts}
                primaryIds={shownPrimaryIds}
                favoritesOnly={favoritesOnly}
                hoveredId={hoveredId}
                selectedId={selectedId}
                onHover={handleResortHover}
                fetchedAt={fetchedAt}
              />
            </section>

            <section>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h2 className="font-bold tracking-tight">Your backcountry spots</h2>
                <button onClick={() => openWelcome("spots")} className="text-xs font-medium text-primary hover:underline">
                  How it works
                </button>
              </div>
              <FavoritesList onGoToMap={() => setMobileView("map")} />
            </section>
          </div>
        </div>

        <div className={`md:w-[360px] md:shrink-0 lg:w-[440px] xl:w-[500px] ${mobileView === "list" ? "hidden md:block" : ""}`}>
          <section className="card h-[38dvh] min-h-[280px] overflow-hidden sm:h-[55dvh] md:sticky md:top-20 md:h-[calc(100dvh-7rem)]">
            <SkiMap
              ref={skiMapRef}
              resorts={shownResorts}
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

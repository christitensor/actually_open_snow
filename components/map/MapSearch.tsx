"use client";

import { useEffect, useId, useRef, useState } from "react";

// Place search for the map, modeled on weather.gov's "City, St or ZIP"
// box — and backed by the same geocoder it uses: Esri's ArcGIS World
// Geocoding Service. Its suggest/findAddressCandidates endpoints are free,
// keyless, and CORS-open for this kind of transient (not stored) lookup,
// confirmed live — and unlike a city-only geocoder, it also resolves
// named peaks and trailheads ("Mount Superior, UT"), which is what a
// backcountry user is most likely to type. Results are limited to the US
// and Canada (like weather.gov, and the NWS-backed parts of this app are
// US-only anyway) and biased toward the current map center, so "Alta"
// finds the Utah resort before Alta, Alberta — without the country
// filter, a short query like that surfaced Mexico and Iraq first.
//
// Curated resorts are matched locally first (instant, no network), and a
// raw "lat, lon" pair is recognized directly, since backcountry users
// often have exact coordinates from a guidebook or GPS track.
const GEOCODER_URL = "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer";

export interface SearchableResort {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** State/province, shown next to catalog ski areas so same-named hills are distinguishable */
  region?: string;
  /** false for catalog ski areas (data/ski-areas.json); undefined/true for the curated set */
  curated?: boolean;
}

// Every ski area in the US/Canada (curated + OpenSkiMap catalog), fetched
// once on first focus — see app/api/ski-areas/route.ts. Module-level so
// it's shared by every search box and survives remounts.
let catalogPromise: Promise<SearchableResort[]> | null = null;
function loadCatalog(): Promise<SearchableResort[]> {
  catalogPromise ??= fetch("/api/ski-areas")
    .then((r) => (r.ok ? (r.json() as Promise<SearchableResort[]>) : []))
    .catch(() => {
      catalogPromise = null; // let a later focus retry
      return [];
    });
  return catalogPromise;
}

// "Snowbasin Resort", "mount bachelor", "Jackson Hole ski area" should all
// find the resort: compare on normalized tokens, ignoring generic words.
const GENERIC = new Set(["resort", "resorts", "ski", "skiing", "area", "the", "and", "of", "at", "snow"]);
const SYNONYM: Record<string, string> = { mount: "mt", saint: "st", mtn: "mountain" };
function tokens(s: string): string[] {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t && !GENERIC.has(t))
    .map((t) => SYNONYM[t] ?? t);
}

/** 0 = no match; higher = better. Every query token must prefix-match a name token. */
export function resortMatchScore(query: string, name: string): number {
  const q = tokens(query);
  const n = tokens(name);
  if (q.length === 0 || n.length === 0) return 0;
  let score = 0;
  for (const qt of q) {
    const i = n.findIndex((nt) => nt.startsWith(qt));
    if (i === -1) return 0;
    score += n[i] === qt ? 3 : 2;
    if (i === 0) score += 1;
  }
  return score - n.length * 0.1; // tighter names win ties ("Alta" over "Alta Lake")
}

export type SearchPick =
  | { kind: "resort"; resort: SearchableResort }
  | {
      kind: "place";
      label: string;
      lat: number;
      lon: number;
      /** [west, south, east, north] when the geocoder returns an extent (cities, ZIPs) */
      bbox?: [number, number, number, number];
    };

type Suggestion =
  | { kind: "resort"; key: string; label: string; resort: SearchableResort }
  | { kind: "coords"; key: string; label: string; lat: number; lon: number }
  | { kind: "geocode"; key: string; label: string; magicKey: string };

function parseCoords(text: string): { lat: number; lon: number } | null {
  const m = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

function distKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = Math.PI / 180;
  const x = (bLon - aLon) * r * Math.cos(((aLat + bLat) / 2) * r);
  const y = (bLat - aLat) * r;
  return Math.sqrt(x * x + y * y) * 6371;
}

/** A known ski area the geocoded place sits on — only when the label reads like that resort, so a town that merely neighbors one still flies to the town. */
function nearbySkiArea(list: SearchableResort[], label: string, lat: number, lon: number): SearchableResort | null {
  const placeName = label.split(",")[0];
  let best: { r: SearchableResort; d: number } | null = null;
  for (const r of list) {
    const d = distKm(lat, lon, r.lat, r.lon);
    if (d > 5) continue;
    const named = resortMatchScore(placeName, r.name) > 0 || resortMatchScore(r.name, placeName) > 0;
    if (!named && !(d < 2 && /\b(ski|resort|basin|bowl)\b/i.test(placeName))) continue;
    if (!best || d < best.d) best = { r, d };
  }
  return best?.r ?? null;
}

interface MapSearchProps {
  resorts: SearchableResort[];
  /** Current map center, read lazily at query time to bias geocoder results. */
  getBias: () => { lat: number; lon: number } | null;
  onPick: (pick: SearchPick) => void;
}

export default function MapSearch({ resorts, getBias, onPick }: MapSearchProps) {
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<SearchableResort[]>([]);
  const [open, setOpen] = useState(false);
  // Results are tagged with the query they answer, so stale ones (from a
  // since-edited query) are simply ignored at render time instead of
  // having to be cleared from inside the effect.
  const [geo, setGeo] = useState<{ forQuery: string; items: Suggestion[]; failed: boolean } | null>(null);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const trimmed = query.trim();
  const coords = parseCoords(trimmed);
  const lower = trimmed.toLowerCase();
  // Curated resorts (the map's own pins) first, then the full catalog —
  // de-duplicated by id, since the catalog list includes the curated set.
  const searchable = [...resorts, ...catalog.filter((c) => !resorts.some((r) => r.id === c.id))];
  const resortMatches: Suggestion[] =
    lower.length >= 2
      ? searchable
          .map((r) => ({ r, score: resortMatchScore(trimmed, r.name) || (r.name.toLowerCase().includes(lower) ? 1 : 0) }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)
          .map(({ r }) => ({ kind: "resort", key: `resort:${r.id}`, label: r.region && r.curated === false ? `${r.name}, ${r.region}` : r.name, resort: r }))
      : [];
  const suggestions: Suggestion[] = [
    ...(coords
      ? [{ kind: "coords" as const, key: "coords", label: `${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}`, ...coords }]
      : []),
    ...resortMatches,
    ...(!coords && geo?.forQuery === trimmed ? geo.items : []),
  ];
  const wantsGeocode = trimmed.length >= 2 && !coords;
  const loading = resolving || (wantsGeocode && geo?.forQuery !== trimmed);
  const shownError = error ?? (wantsGeocode && geo?.forQuery === trimmed && geo.failed ? "Place search is unavailable right now." : null);

  // Debounced, abortable suggest — a fast typist would otherwise fire a
  // request per keystroke, and a slow early response could overwrite a
  // later one's results.
  useEffect(() => {
    if (trimmed.length < 2 || parseCoords(trimmed)) return;
    const controller = new AbortController();
    // A hung request (flaky mountain cell service) shouldn't leave
    // "Searching…" up forever — give up and say so after a few seconds.
    let timedOut = false;
    let giveUp: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(async () => {
      giveUp = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 8000);
      try {
        const params = new URLSearchParams({ text: trimmed, f: "json", maxSuggestions: "6", countryCode: "USA,CAN" });
        const bias = getBias();
        if (bias) params.set("location", `${bias.lon},${bias.lat}`);
        const res = await fetch(`${GEOCODER_URL}/suggest?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { suggestions?: { text: string; magicKey: string; isCollection: boolean }[] };
        setGeo({
          forQuery: trimmed,
          failed: false,
          items: (body.suggestions ?? [])
            // "Collections" are category searches ("coffee shops") that
            // resolve to many points, not one place — not useful here.
            .filter((s) => !s.isCollection)
            .map((s) => ({ kind: "geocode", key: `geo:${s.magicKey}`, label: s.text, magicKey: s.magicKey })),
        });
      } catch (e) {
        if (timedOut || (e as Error).name !== "AbortError") setGeo({ forQuery: trimmed, items: [], failed: true });
      } finally {
        clearTimeout(giveUp);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      clearTimeout(giveUp);
      controller.abort();
    };
  }, [trimmed, getBias]);

  const choose = async (s: Suggestion | undefined) => {
    if (!s) return;
    if (s.kind === "resort") {
      onPick({ kind: "resort", resort: s.resort });
    } else if (s.kind === "coords") {
      onPick({ kind: "place", label: s.label, lat: s.lat, lon: s.lon });
    } else {
      try {
        setResolving(true);
        const params = new URLSearchParams({ SingleLine: s.label, magicKey: s.magicKey, f: "json", maxLocations: "1" });
        const res = await fetch(`${GEOCODER_URL}/findAddressCandidates?${params}`, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as {
          candidates?: { location: { x: number; y: number }; extent?: { xmin: number; ymin: number; xmax: number; ymax: number } }[];
        };
        const c = body.candidates?.[0];
        if (!c) {
          setError("Couldn't find that place.");
          return;
        }
        // The geocoder knows ski resorts as places too ("Big Sky Resort,
        // MT") — when its answer is a known ski area, open the full resort
        // page (webcams and all) instead of just dropping a map marker.
        const skiArea = nearbySkiArea(searchable, s.label, c.location.y, c.location.x);
        if (skiArea) {
          onPick({ kind: "resort", resort: skiArea });
        } else {
          onPick({
            kind: "place",
            label: s.label,
            lat: c.location.y,
            lon: c.location.x,
            bbox: c.extent ? [c.extent.xmin, c.extent.ymin, c.extent.xmax, c.extent.ymax] : undefined,
          });
        }
      } catch {
        setError("Place search is unavailable right now.");
        return;
      } finally {
        setResolving(false);
      }
    }
    setQuery(s.label);
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      // Like weather.gov: Enter with nothing highlighted takes the top result.
      void choose(suggestions[activeIndex >= 0 ? activeIndex : 0]);
    } else if (e.key === "Escape") {
      // Don't also let SkiMap's document-level Escape exit full screen.
      e.stopPropagation();
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const showList = open && trimmed.length >= 2 && (suggestions.length > 0 || loading || shownError != null);

  return (
    <div className="relative w-full">
      <div className="flex items-center gap-2 rounded-full border border-border bg-card/95 px-3 shadow-sm backdrop-blur-sm focus-within:border-primary">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="shrink-0 text-muted-foreground" aria-hidden>
          <circle cx="7" cy="7" r="4.5" />
          <path d="m10.5 10.5 3.5 3.5" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label="Search for a place"
          aria-activedescendant={activeIndex >= 0 && suggestions[activeIndex] ? `${listId}-${activeIndex}` : undefined}
          // 16px text: iOS Safari auto-zooms the page when focusing any input smaller than that.
          className="h-9 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground sm:text-sm [&::-webkit-search-cancel-button]:hidden"
          placeholder="City, ZIP, peak, resort, or lat, lon"
          value={query}
          autoComplete="off"
          enterKeyHint="search"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIndex(-1);
            setError(null);
          }}
          onFocus={() => {
            setOpen(true);
            void loadCatalog().then((list) => {
              if (list.length) setCatalog(list);
            });
          }}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            // mousedown, not click: keeps the input from blurring first.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setQuery("");
              setActiveIndex(-1);
              inputRef.current?.focus();
            }}
            className="shrink-0 rounded-full px-1 text-lg leading-none text-muted-foreground hover:text-foreground"
          >
            ×
          </button>
        )}
      </div>
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full right-0 left-0 mt-1 max-h-72 overflow-y-auto rounded-2xl border border-border bg-card py-1 text-sm shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.key}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void choose(s)}
              onMouseEnter={() => setActiveIndex(i)}
              className={`flex cursor-pointer items-center gap-2 px-3 py-2 ${i === activeIndex ? "bg-muted" : ""}`}
            >
              <span className="min-w-0 flex-1 truncate text-foreground">{s.label}</span>
              {s.kind !== "geocode" && (
                <span className="shrink-0 text-[11px] font-semibold text-muted-foreground uppercase">
                  {s.kind === "resort" ? "Resort" : "Coordinates"}
                </span>
              )}
            </li>
          ))}
          {loading && <li className="px-3 py-2 text-muted-foreground">Searching…</li>}
          {shownError && !loading && <li className="px-3 py-2 text-muted-foreground">{shownError}</li>}
          {!loading && !shownError && suggestions.length === 0 && <li className="px-3 py-2 text-muted-foreground">No matches.</li>}
        </ul>
      )}
    </div>
  );
}

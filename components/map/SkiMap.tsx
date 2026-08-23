"use client";

import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  Popup,
  type DataDrivenPropertyValueSpecification,
  type GeoJSONSource,
  type MapMouseEvent,
  type StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { AvalancheObservation, Webcam } from "@/lib/models/types";
import type { KeyStationPoint, SnotelStationPoint } from "@/app/api/weather-stations/route";
import { getIsDarkServerSnapshot, getIsDarkSnapshot, subscribeToTheme } from "@/lib/theme";

interface MapPin {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** MAP-10 Powder Finder: today's forecast snowfall (inches) for this resort, if known — colors the pin */
  snowfallTodayIn?: number;
}

function powderColor(inches: number | undefined): string {
  if (inches == null) return "#2563eb";
  if (inches >= 8) return "#a21caf";
  if (inches >= 4) return "#7c3aed";
  if (inches >= 1) return "#2563eb";
  if (inches > 0) return "#60a5fa";
  return "#9ca3af";
}

// No MapTiler/vector-tile API key configured anywhere in this build, so
// the base map is plain raster tiles — free, no key, always works. Three
// swappable base layers, all free/open, no key: street, OpenTopoMap
// (topo, built from OSM + SRTM elevation), and Esri World Imagery
// (satellite, Esri's public tile service). All three are added as
// sources/layers up front with only one visible at a time (same pattern
// as the radar/snow-forecast toggles below) rather than swapping the
// whole style — that would blow away the pistes/radar/snow-grid layers
// added at runtime.
//
// "Street" is CARTO's free Voyager/Dark Matter basemaps, not raw OSM
// tiles: both are CORS-open with no key required (confirmed live), and
// requesting the "@2x" filename at the same tileSize:256 pulls a
// double-resolution image into the same on-screen tile slot — sharper on
// any HiDPI display, the same trick as an <img srcset> 2x variant. Dark
// mode swaps to CARTO's actual dark cartography (osm-dark) instead of the
// previous CSS invert-filter hack, which also inverted markers/popups and
// produced a flatter, muddier result than a real dark basemap.
type BaseLayerId = "osm" | "topo" | "satellite";
const BASE_LAYER_IDS: BaseLayerId[] = ["osm", "topo", "satellite"];
const BASE_LAYER_LABELS: Record<BaseLayerId, string> = { osm: "Street", topo: "Topo", satellite: "Satellite" };

const BASE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png"],
      tileSize: 256,
      maxzoom: 20,
      attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
    },
    "osm-dark": {
      type: "raster",
      tiles: ["https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png"],
      tileSize: 256,
      maxzoom: 20,
      attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
    },
    topo: {
      type: "raster",
      tiles: [
        "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
        "https://b.tile.opentopomap.org/{z}/{x}/{y}.png",
        "https://c.tile.opentopomap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      maxzoom: 17,
      attribution: "Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap (CC-BY-SA)",
    },
    satellite: {
      type: "raster",
      // Esri's public World Imagery tile service — free, no key, {z}/{y}/{x} order (not the usual {z}/{x}/{y}).
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    },
  },
  layers: [
    { id: "osm", type: "raster", source: "osm" },
    { id: "osm-dark", type: "raster", source: "osm-dark", layout: { visibility: "none" } },
    { id: "topo", type: "raster", source: "topo", layout: { visibility: "none" } },
    { id: "satellite", type: "raster", source: "satellite", layout: { visibility: "none" } },
  ],
};

const DIFFICULTY_COLORS: Record<string, string> = {
  novice: "#22c55e",
  easy: "#22c55e",
  intermediate: "#3b82f6",
  advanced: "#111827",
  expert: "#111827",
  freeride: "#f97316",
};

interface PisteWay {
  id: number;
  difficulty: string | null;
  coordinates: [number, number][];
}

interface SkiMapProps {
  resorts: MapPin[];
  webcams?: Webcam[];
  /** Highlights where the current page's location is, distinct from the clickable resort pins — not itself clickable-to-navigate. */
  currentLocation?: { name: string; lat: number; lon: number };
  center: [number, number]; // [lon, lat]
  zoom?: number;
  showPistes?: boolean;
  allowPinDrop?: boolean;
  showRadarToggle?: boolean;
  showSnowForecastToggle?: boolean;
  showAvalancheObservationsToggle?: boolean;
}

// UAC reports aspect as a full compass word ("North", "Southwest") — the
// filter uses the same words directly rather than abbreviations, so
// matching is a plain case-insensitive equality check, no parsing needed.
const ASPECTS = ["North", "Northeast", "East", "Southeast", "South", "Southwest", "West", "Northwest"];
const ELEVATION_BANDS: { label: string; minFt: number }[] = [
  { label: "Any elevation", minFt: 0 },
  { label: "8,000 ft+", minFt: 8000 },
  { label: "9,000 ft+", minFt: 9000 },
  { label: "10,000 ft+", minFt: 10000 },
  { label: "11,000 ft+", minFt: 11000 },
];
const TIME_WINDOWS: { label: string; maxDays: number }[] = [
  { label: "Any time", maxDays: 0 },
  { label: "Last 7 days", maxDays: 7 },
  { label: "Last 14 days", maxDays: 14 },
  { label: "Last 30 days", maxDays: 30 },
];

// UAC's date strings look like "Sun, 05/31/2026" — the leading weekday
// isn't needed for parsing and JS's Date constructor handles the rest
// (US MM/DD/YYYY) directly. Returns null for anything that doesn't parse
// cleanly rather than guessing, since a filter silently hiding reports it
// can't date would be worse than one that just doesn't filter them.
function parseUacDate(raw: string): Date | null {
  const d = new Date(raw.replace(/^[A-Za-z]{3},\s*/, ""));
  return Number.isNaN(d.getTime()) ? null : d;
}

// RainViewer's public API (free, CORS-open, no key) — MAP-02/03 current
// radar. Their nowcast/forecast frames aren't used here, only the latest
// observed frame; see TRACE_MATRIX.md MAP-02 for why forecast radar is
// out of scope for now.
const RAINVIEWER_MAPS_URL = "https://api.rainviewer.com/public/weather-maps.json";

export default function SkiMap({
  resorts,
  webcams = [],
  currentLocation,
  center,
  zoom = 9,
  showPistes = true,
  allowPinDrop = true,
  showRadarToggle = true,
  showSnowForecastToggle = true,
  showAvalancheObservationsToggle = true,
}: SkiMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const router = useRouter();
  const [radarOn, setRadarOn] = useState(false);
  const [radarReady, setRadarReady] = useState(false);
  const [radarTime, setRadarTime] = useState<string | null>(null);
  const [snowOverlayOn, setSnowOverlayOn] = useState(false);
  const snowOverlayOnRef = useRef(false);
  const loadSnowGridRef = useRef<(() => void) | null>(null);
  // BC-03: "Avalanche observations" mode — recent UAC field reports as map
  // points, with client-side filters (the source API has no documented
  // filter params of its own — see lib/data-sources/uac-observations.ts).
  const [obsOn, setObsOn] = useState(false);
  const [obsLoading, setObsLoading] = useState(false);
  const [observations, setObservations] = useState<AvalancheObservation[] | null>(null);
  const [obsTypeFilter, setObsTypeFilter] = useState<"all" | "avalanche" | "observation">("all");
  const [obsAspectFilter, setObsAspectFilter] = useState<"all" | (typeof ASPECTS)[number]>("all");
  const [obsMinElevationFt, setObsMinElevationFt] = useState(0);
  const [obsMaxAgeDays, setObsMaxAgeDays] = useState(0);
  // Date.now() is impure and can't be called directly during render/memo —
  // captured once via a lazy initializer instead, which only runs on first
  // mount. A coarse "last N days" filter doesn't need to stay live-accurate
  // to the millisecond for however long this map instance stays mounted.
  const [obsFilterNowMs] = useState(() => Date.now());
  const [baseLayer, setBaseLayer] = useState<BaseLayerId>("osm");
  // Full-screen mode: a CSS fixed-position overlay rather than the native
  // Fullscreen API, since Element.requestFullscreen() is unreliable in an
  // iOS home-screen PWA (this app's primary use case, per the sign-in
  // work above) — a fixed overlay works identically everywhere. The
  // existing ResizeObserver on containerRef already calls map.resize()
  // whenever the container's size changes, so toggling the container's
  // size via CSS classes is enough to make the map itself redraw correctly.
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isFullscreen]);
  // Deliberately not map.isStyleLoaded(): it also factors in whether every
  // source's tiles have finished loading, so one slow/failed tile fetch
  // (e.g. a flaky connection) can leave it false long after the style
  // itself is mutation-ready — live-verified this stalls the base-layer
  // switcher indefinitely. The map's one-time "load" event is what
  // actually marks the style ready for setLayoutProperty calls.
  const styleReadyRef = useRef(false);
  const applyObservationsRef = useRef<((geojson: GeoJSON.FeatureCollection) => void) | null>(null);
  // Tracks the theme toggle (in AppHeader) so the map's street layer can
  // swap to a real dark basemap — this component has no other awareness
  // of the theme system, so it watches the <html> class directly.
  const isDark = useSyncExternalStore(subscribeToTheme, getIsDarkSnapshot, getIsDarkServerSnapshot);
  // DATA-01: "weather stations" mode — curated NWS mountain stations +
  // every Phase-1 SNOTEL station, merged server-side (/api/weather-stations)
  // since the two live in different APIs with different id/coordinate
  // shapes. Fetched once per toggle-on, same lazy-load pattern as
  // avalanche observations below.
  const [stationsOn, setStationsOn] = useState(false);
  const [stationsLoading, setStationsLoading] = useState(false);
  const [stationsData, setStationsData] = useState<{ keyStations: KeyStationPoint[]; snotel: SnotelStationPoint[] } | null>(null);
  const applyStationsRef = useRef<((geojson: GeoJSON.FeatureCollection) => void) | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: BASE_STYLE,
      center,
      zoom,
    });
    mapRef.current = map;
    map.once("load", () => {
      styleReadyRef.current = true;
    });
    map.addControl(new NavigationControl(), "top-right");

    // Sticky/flex sidebars (the desktop layout on both the home page and
    // location pages) don't necessarily have their final size yet when
    // this effect runs — MapLibre computes its projection matrix from
    // the container's size at that moment and never re-checks it on its
    // own. Live-verified: without this, marker positions ended up
    // computed against a stale container box, landing hundreds to
    // thousands of pixels outside the actually-visible map — clickable
    // in theory, but nowhere the user could see or reach. A
    // ResizeObserver keeps the map's internal size in sync with
    // whatever its container actually ends up being, not just at mount.
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    // MAP-17: click anywhere that isn't a marker drops a backcountry pin.
    if (allowPinDrop) {
      map.on("click", (e: MapMouseEvent) => {
        const { lat, lng } = e.lngLat;
        router.push(`/location/pin?lat=${lat.toFixed(5)}&lon=${lng.toFixed(5)}`);
      });
    }

    // Resort pins — colored by today's forecast snowfall when known (MAP-10 Powder Finder).
    for (const resort of resorts) {
      const el = document.createElement("div");
      const color = powderColor(resort.snowfallTodayIn);
      // z-index above webcam pins: a few resorts (Alta, Brighton, Park City,
      // Powder Mountain) have a webcam sitting at effectively the same
      // coordinates, and without this the webcam pin — added after, so
      // painted on top by default — silently ate the click (its own handler
      // only stops propagation, no navigation), live-verified as the actual
      // cause of "clicking the map does nothing" for those resorts.
      el.style.cssText = `width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.4);z-index:2;`;
      el.title = resort.snowfallTodayIn != null ? `${resort.name} — ${resort.snowfallTodayIn.toFixed(1)}" today` : resort.name;
      el.addEventListener("click", (ev) => {
        ev.stopPropagation(); // don't also trigger the map's pin-drop handler
        router.push(`/location/${resort.id}`);
      });
      new Marker({ element: el }).setLngLat([resort.lon, resort.lat]).addTo(map);
    }

    // "You are here" — distinct from the clickable resort pins above, and
    // deliberately not wired to navigate anywhere (you're already on this
    // location's page).
    if (currentLocation) {
      const el = document.createElement("div");
      el.style.cssText =
        "width:18px;height:18px;border-radius:50%;background:var(--color-accent, #f59e0b);border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,.5);";
      el.title = `${currentLocation.name} (this location)`;
      el.addEventListener("click", (ev) => ev.stopPropagation());
      new Marker({ element: el }).setLngLat([currentLocation.lon, currentLocation.lat]).addTo(map);
    }

    // Webcam pins (MAP-16) — orange. Popup shows a live snapshot for cams
    // with a verified imageUrl, otherwise falls back to a link-out.
    for (const cam of webcams) {
      const el = document.createElement("div");
      el.style.cssText =
        "width:12px;height:12px;border-radius:2px;background:#f97316;border:2px solid white;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.4);";
      el.title = cam.name;
      el.addEventListener("click", (ev) => ev.stopPropagation());
      // Some imageUrls already carry a query string (e.g. Alta's PrismCam
      // preview endpoint, ?c=65&s=720) — a bare "?t=" would double up the
      // "?" and break the request (confirmed live: the endpoint returns a
      // tiny broken-image placeholder for a malformed double-"?" URL, a
      // real image for the same URL with "&t=" instead). Some CDNs also
      // 404 on any param name they don't recognize (skiutah.com's blob
      // endpoint wants "_ts", not "t") — cam.cacheBustParam overrides it.
      const cacheBustParam = cam.cacheBustParam ?? "t";
      const cacheBustedImageUrl = cam.imageUrl
        ? `${cam.imageUrl}${cam.imageUrl.includes("?") ? "&" : "?"}${cacheBustParam}=${Date.now()}`
        : undefined;
      const popupHtml = cacheBustedImageUrl
        ? `<strong>${cam.name}</strong><br/><img src="${cacheBustedImageUrl}" alt="${cam.name}" style="width:220px;height:auto;border-radius:4px;margin-top:4px" /><br/><a href="${cam.pageUrl}" target="_blank" rel="noopener noreferrer" style="font-size:11px">Full page ↗</a>`
        : `<strong>${cam.name}</strong><br/><a href="${cam.pageUrl}" target="_blank" rel="noopener noreferrer">View webcam ↗</a>`;
      const popup = new Popup({ offset: 12 }).setHTML(popupHtml);
      new Marker({ element: el }).setLngLat([cam.lon, cam.lat]).setPopup(popup).addTo(map);
    }

    // MAP-13: piste overlay, refetched (debounced) as the user pans/zooms.
    if (showPistes) {
      let debounceTimer: ReturnType<typeof setTimeout> | undefined;

      const loadPistes = async () => {
        const bounds = map.getBounds();
        const bbox = [bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()].join(",");
        try {
          const res = await fetch(`/api/pistes?bbox=${bbox}`);
          if (!res.ok) return;
          const { pistes } = (await res.json()) as { pistes: PisteWay[] };

          const geojson: GeoJSON.FeatureCollection = {
            type: "FeatureCollection",
            features: pistes.map((p) => ({
              type: "Feature",
              properties: { difficulty: p.difficulty ?? "intermediate" },
              geometry: { type: "LineString", coordinates: p.coordinates },
            })),
          };

          const source = map.getSource("pistes") as GeoJSONSource | undefined;
          if (source) {
            source.setData(geojson);
          } else if (styleReadyRef.current) {
            map.addSource("pistes", { type: "geojson", data: geojson });
            map.addLayer({
              id: "pistes-line",
              type: "line",
              source: "pistes",
              paint: {
                "line-color": [
                  "match",
                  ["get", "difficulty"],
                  ...Object.entries(DIFFICULTY_COLORS).flat(),
                  "#6b7280",
                ] as unknown as DataDrivenPropertyValueSpecification<string>,
                "line-width": 2,
              },
            });
          }
        } catch {
          // Overpass can be slow/rate-limited — a missing piste overlay
          // shouldn't break the rest of the map.
        }
      };

      map.on("load", loadPistes);
      map.on("moveend", () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(loadPistes, 500);
      });
    }

    // MAP-04/05: sampled forecast-snowfall grid overlay, toggled like radar.
    if (showSnowForecastToggle) {
      let snowDebounce: ReturnType<typeof setTimeout> | undefined;

      const loadSnowGrid = async () => {
        if (!snowOverlayOnRef.current) return;
        const bounds = map.getBounds();
        const bbox = [bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()].join(",");
        try {
          const res = await fetch(`/api/forecast-grid?bbox=${bbox}`);
          if (!res.ok) return;
          const { grid } = (await res.json()) as { grid: { lat: number; lon: number; valueIn: number }[] };

          const geojson: GeoJSON.FeatureCollection = {
            type: "FeatureCollection",
            features: grid.map((p) => ({
              type: "Feature",
              properties: { valueIn: p.valueIn },
              geometry: { type: "Point", coordinates: [p.lon, p.lat] },
            })),
          };

          const source = map.getSource("snow-grid") as GeoJSONSource | undefined;
          if (source) {
            source.setData(geojson);
          } else if (styleReadyRef.current) {
            map.addSource("snow-grid", { type: "geojson", data: geojson });
            map.addLayer({
              id: "snow-grid-circles",
              type: "circle",
              source: "snow-grid",
              layout: { visibility: "none" },
              paint: {
                "circle-radius": 18,
                "circle-blur": 0.8,
                "circle-opacity": 0.55,
                "circle-color": [
                  "interpolate",
                  ["linear"],
                  ["get", "valueIn"],
                  0,
                  "#ffffff00",
                  0.5,
                  "#93c5fd",
                  2,
                  "#3b82f6",
                  6,
                  "#7c3aed",
                  12,
                  "#db2777",
                ] as unknown as DataDrivenPropertyValueSpecification<string>,
              },
            });
          }
        } catch {
          // A missing snow overlay shouldn't break the rest of the map.
        }
      };

      map.on("moveend", () => {
        clearTimeout(snowDebounce);
        snowDebounce = setTimeout(loadSnowGrid, 500);
      });
      loadSnowGridRef.current = loadSnowGrid;
    }

    // MAP-02/03: current radar, added once but only shown once toggled on.
    if (showRadarToggle) {
      map.on("load", async () => {
        try {
          const res = await fetch(RAINVIEWER_MAPS_URL);
          if (!res.ok) return;
          const data = (await res.json()) as { host: string; radar: { past: { time: number; path: string }[] } };
          const latest = data.radar.past.at(-1);
          if (!latest) return;

          const tileUrl = `${data.host}${latest.path}/256/{z}/{x}/{y}/2/1_1.png`;
          map.addSource("radar", { type: "raster", tiles: [tileUrl], tileSize: 256 });
          map.addLayer({ id: "radar-layer", type: "raster", source: "radar", paint: { "raster-opacity": 0.6 }, layout: { visibility: "none" } });
          setRadarTime(new Date(latest.time * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
          setRadarReady(true);
        } catch {
          // RainViewer being unreachable shouldn't break the rest of the map.
        }
      });
    }

    // BC-03: avalanche observations layer — created lazily (same pattern as
    // pistes/snow-grid above) the first time there's data to show, since
    // source/layer creation needs the style to be loaded. A separate
    // effect below owns fetching + filtering; this just knows how to draw
    // whatever GeoJSON it's handed.
    if (showAvalancheObservationsToggle) {
      const applyObservations = (geojson: GeoJSON.FeatureCollection) => {
        const source = map.getSource("avalanche-observations") as GeoJSONSource | undefined;
        if (source) {
          source.setData(geojson);
          return;
        }
        if (!styleReadyRef.current) return;
        map.addSource("avalanche-observations", { type: "geojson", data: geojson });
        map.addLayer({
          id: "avalanche-observations-circles",
          type: "circle",
          source: "avalanche-observations",
          layout: { visibility: "none" },
          paint: {
            "circle-radius": 7,
            "circle-color": ["match", ["get", "type"], "avalanche", "#dc2626", "#f59e0b"] as unknown as DataDrivenPropertyValueSpecification<string>,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
        });
        map.on("click", "avalanche-observations-circles", (e) => {
          const feature = e.features?.[0];
          if (!feature || feature.geometry.type !== "Point") return;
          const p = feature.properties as Record<string, string>;
          const html =
            `<strong>${p.title}</strong><br/>` +
            `<span style="font-size:11px;color:#666">${p.type === "avalanche" ? "Avalanche" : "Observation"} · ${p.date}${p.region ? ` · ${p.region}` : ""}</span><br/>` +
            (p.locationName ? `${p.locationName}<br/>` : "") +
            (p.aspect || p.elevationFt ? `${p.aspect ? `Aspect: ${p.aspect}` : ""}${p.aspect && p.elevationFt ? " · " : ""}${p.elevationFt ? `${p.elevationFt} ft` : ""}<br/>` : "") +
            (p.details ? `<p style="margin:4px 0;font-size:12px;max-width:220px">${p.details}</p>` : "") +
            `<a href="${p.detailsUrl}" target="_blank" rel="noopener noreferrer" style="font-size:11px">Full report ↗</a>`;
          new Popup({ offset: 8 })
            .setLngLat(feature.geometry.coordinates as [number, number])
            .setHTML(html)
            .addTo(map);
        });
        map.on("mouseenter", "avalanche-observations-circles", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "avalanche-observations-circles", () => {
          map.getCanvas().style.cursor = "";
        });
      };
      applyObservationsRef.current = applyObservations;
    }

    // DATA-01: weather stations layer — same lazy source/layer creation
    // pattern as avalanche observations above. "kind" (key vs snotel)
    // drives both color and which fields the click popup shows, since the
    // two source APIs return different fields (temp/wind vs snow depth/SWE).
    {
      const applyStations = (geojson: GeoJSON.FeatureCollection) => {
        const source = map.getSource("weather-stations") as GeoJSONSource | undefined;
        if (source) {
          source.setData(geojson);
          return;
        }
        if (!styleReadyRef.current) return;
        map.addSource("weather-stations", { type: "geojson", data: geojson });
        map.addLayer({
          id: "weather-stations-circles",
          type: "circle",
          source: "weather-stations",
          layout: { visibility: "none" },
          paint: {
            "circle-radius": 6,
            "circle-color": ["match", ["get", "kind"], "key", "#0891b2", "#7c3aed"] as unknown as DataDrivenPropertyValueSpecification<string>,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
        });
        map.on("click", "weather-stations-circles", (e) => {
          const feature = e.features?.[0];
          if (!feature || feature.geometry.type !== "Point") return;
          const p = feature.properties as Record<string, string>;
          const elevation = p.elevationFt ? `${p.elevationFt} ft` : "";
          const html =
            p.kind === "key"
              ? `<strong>${p.name}</strong><br/>` +
                `<span style="font-size:11px;color:#666">${elevation}</span><br/>` +
                `${p.tempF ? `${Math.round(Number(p.tempF))}°F` : "No temp reading"}` +
                `${p.windSpeedMph ? ` · ${Math.round(Number(p.windSpeedMph))} mph` : ""}<br/>` +
                `<span style="font-size:11px;color:#666">NWS · ${p.observedAt ? new Date(p.observedAt).toLocaleString() : "no timestamp"}</span>`
              : `<strong>${p.name}</strong><br/>` +
                `<span style="font-size:11px;color:#666">${elevation}</span><br/>` +
                `${p.snowDepthIn ? `${p.snowDepthIn}" snow depth` : "No depth reading"}` +
                `${p.sweIn ? ` · ${p.sweIn}" SWE` : ""}<br/>` +
                `<span style="font-size:11px;color:#666">SNOTEL · ${p.date}</span>`;
          new Popup({ offset: 8 }).setLngLat(feature.geometry.coordinates as [number, number]).setHTML(html).addTo(map);
        });
        map.on("mouseenter", "weather-stations-circles", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "weather-stations-circles", () => {
          map.getCanvas().style.cursor = "";
        });
      };
      applyStationsRef.current = applyStations;
    }

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- map is initialized once; props are read at mount time
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !radarReady) return;
    map.setLayoutProperty("radar-layer", "visibility", radarOn ? "visible" : "none");
  }, [radarOn, radarReady]);

  useEffect(() => {
    snowOverlayOnRef.current = snowOverlayOn;
    const map = mapRef.current;
    if (!map || !map.getLayer("snow-grid-circles")) return;
    map.setLayoutProperty("snow-grid-circles", "visibility", snowOverlayOn ? "visible" : "none");
    if (snowOverlayOn) loadSnowGridRef.current?.();
  }, [snowOverlayOn]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // "osm" has a real dark counterpart (osm-dark); topo/satellite don't
    // (inverting relief shading or a satellite photo produces a
    // false-color mess), so only the street layer swaps by theme.
    const visibleId = baseLayer === "osm" && isDark ? "osm-dark" : baseLayer;
    const apply = () => {
      for (const id of ["osm", "osm-dark", "topo", "satellite"]) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", id === visibleId ? "visible" : "none");
      }
    };
    // On mount this can fire before the initial style has finished loading
    // (setLayoutProperty throws on an unloaded style); everything after
    // mount, the style is already loaded and this runs immediately.
    if (styleReadyRef.current) apply();
    else map.once("load", apply);
  }, [baseLayer, isDark]);

  // Fetch UAC observations once, the first time the mode is switched on.
  useEffect(() => {
    if (!obsOn || observations != null) return;
    let cancelled = false;
    (async () => {
      setObsLoading(true);
      try {
        const res = await fetch("/api/avalanche-observations");
        if (!res.ok) return;
        const body = (await res.json()) as { observations: AvalancheObservation[] };
        if (!cancelled) setObservations(body.observations);
      } catch {
        // Best-effort — the toggle just won't show any points if this fails.
      } finally {
        if (!cancelled) setObsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [obsOn, observations]);

  // Shared between the render-effect below and the empty-state message in
  // the JSX, so "nothing plotted" and "nothing to plot" never disagree.
  const filteredObservations = useMemo(() => {
    const cutoff = obsMaxAgeDays > 0 ? obsFilterNowMs - obsMaxAgeDays * 24 * 60 * 60 * 1000 : null;
    return (observations ?? []).filter((o) => {
      if (obsTypeFilter !== "all" && o.type !== obsTypeFilter) return false;
      if (obsAspectFilter !== "all" && o.aspect !== obsAspectFilter) return false;
      if (obsMinElevationFt > 0 && (o.elevationFt == null || o.elevationFt < obsMinElevationFt)) return false;
      if (cutoff != null) {
        const parsed = parseUacDate(o.date);
        if (parsed == null || parsed.getTime() < cutoff) return false;
      }
      return true;
    });
  }, [observations, obsTypeFilter, obsAspectFilter, obsMinElevationFt, obsMaxAgeDays, obsFilterNowMs]);

  // Apply the type/aspect/elevation filters and (re)draw whenever the data
  // or any filter changes; separately toggle layer visibility with obsOn.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const filtered = filteredObservations;

    const geojson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: filtered
        .filter((o): o is AvalancheObservation & { lat: number; lon: number } => o.lat != null && o.lon != null)
        .map((o) => ({
          type: "Feature",
          properties: {
            type: o.type,
            title: o.title,
            date: o.date,
            region: o.region,
            locationName: o.locationName,
            aspect: o.aspect ?? "",
            elevationFt: o.elevationFt ?? "",
            details: o.details,
            detailsUrl: o.detailsUrl,
          },
          geometry: { type: "Point", coordinates: [o.lon, o.lat] },
        })),
    };

    const apply = () => applyObservationsRef.current?.(geojson);
    if (styleReadyRef.current) apply();
    else map.once("load", apply);

    if (map.getLayer("avalanche-observations-circles")) {
      map.setLayoutProperty("avalanche-observations-circles", "visibility", obsOn ? "visible" : "none");
    }
  }, [filteredObservations, obsOn]);

  // Fetch weather stations once, the first time the mode is switched on.
  useEffect(() => {
    if (!stationsOn || stationsData != null) return;
    let cancelled = false;
    (async () => {
      setStationsLoading(true);
      try {
        const res = await fetch("/api/weather-stations");
        if (!res.ok) return;
        const body = (await res.json()) as { keyStations: KeyStationPoint[]; snotel: SnotelStationPoint[] };
        if (!cancelled) setStationsData(body);
      } catch {
        // Best-effort — the toggle just won't show any points if this fails.
      } finally {
        if (!cancelled) setStationsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stationsOn, stationsData]);

  // Draw whenever the data changes; separately toggle layer visibility with stationsOn.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const geojson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        ...(stationsData?.keyStations ?? []).map((s) => ({
          type: "Feature" as const,
          properties: {
            kind: "key",
            name: s.name,
            elevationFt: s.elevationFt ?? "",
            tempF: s.tempF ?? "",
            windSpeedMph: s.windSpeedMph ?? "",
            observedAt: s.observedAt ?? "",
          },
          geometry: { type: "Point" as const, coordinates: [s.lon, s.lat] },
        })),
        ...(stationsData?.snotel ?? []).map((s) => ({
          type: "Feature" as const,
          properties: {
            kind: "snotel",
            name: s.name,
            elevationFt: s.elevationFt,
            snowDepthIn: s.snowDepthIn ?? "",
            sweIn: s.sweIn ?? "",
            date: s.date,
          },
          geometry: { type: "Point" as const, coordinates: [s.lon, s.lat] },
        })),
      ],
    };

    const apply = () => applyStationsRef.current?.(geojson);
    if (styleReadyRef.current) apply();
    else map.once("load", apply);

    if (map.getLayer("weather-stations-circles")) {
      map.setLayoutProperty("weather-stations-circles", "visibility", stationsOn ? "visible" : "none");
    }
  }, [stationsData, stationsOn]);

  // Full-screen renders through a portal to document.body rather than in
  // place: this component is nested inside a `sticky`-positioned card on
  // every page that uses it (the home page's map panel, the location
  // dashboard's sidebar), and `position: sticky` always creates its own
  // stacking context — trapping a nested z-50 fixed overlay inside it, so
  // it painted BELOW the page header's own (lower) z-index stacking
  // context instead of above it (live-verified: the header rendered on
  // top of the "fullscreen" map). A portal moves the same DOM subtree to
  // body, escaping that ancestor's stacking context entirely — MapLibre's
  // container node is relocated, not recreated, so the map instance
  // itself is undisturbed.
  const mapContent = (
    <div className={isFullscreen ? "fixed inset-0 z-50 h-dvh w-dvw bg-background" : "relative h-full w-full"}>
      <div ref={containerRef} className="h-full w-full" />
      <button
        onClick={() => setIsFullscreen((v) => !v)}
        aria-label={isFullscreen ? "Exit full screen" : "Full screen"}
        title={isFullscreen ? "Exit full screen" : "Full screen"}
        className="absolute right-3 bottom-3 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card/90 text-foreground shadow-sm backdrop-blur-sm transition hover:text-primary"
      >
        {isFullscreen ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2v3a1 1 0 0 1-1 1H2M14 6h-3a1 1 0 0 1-1-1V2M10 14v-3a1 1 0 0 1 1-1h3M2 10h3a1 1 0 0 1 1 1v3" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 6V3a1 1 0 0 1 1-1h3M14 6V3a1 1 0 0 0-1-1h-3M2 10v3a1 1 0 0 0 1 1h3M14 10v3a1 1 0 0 1-1 1h-3" />
          </svg>
        )}
      </button>
      <div className="absolute top-3 left-3 z-10 flex gap-1 rounded-full border border-border bg-card/90 p-1 text-xs shadow-sm backdrop-blur-sm">
        {BASE_LAYER_IDS.map((id) => (
          <button
            key={id}
            onClick={() => setBaseLayer(id)}
            className={`rounded-full px-2.5 py-1 font-semibold transition ${
              baseLayer === id ? "bg-primary text-primary-foreground" : "text-foreground hover:text-primary"
            }`}
          >
            {BASE_LAYER_LABELS[id]}
          </button>
        ))}
      </div>
      <div className="absolute bottom-3 left-3 z-10 flex flex-col items-start gap-2">
        {obsOn && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-border bg-card/90 p-2 text-xs shadow-sm backdrop-blur-sm">
            <select
              value={obsTypeFilter}
              onChange={(e) => setObsTypeFilter(e.target.value as typeof obsTypeFilter)}
              className="rounded-full border border-border bg-card px-2 py-1 text-xs"
              aria-label="Filter by report type"
            >
              <option value="all">All reports</option>
              <option value="avalanche">Avalanches</option>
              <option value="observation">Observations</option>
            </select>
            <select
              value={obsAspectFilter}
              onChange={(e) => setObsAspectFilter(e.target.value as typeof obsAspectFilter)}
              className="rounded-full border border-border bg-card px-2 py-1 text-xs"
              aria-label="Filter by aspect"
            >
              <option value="all">Any aspect</option>
              {ASPECTS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <select
              value={obsMinElevationFt}
              onChange={(e) => setObsMinElevationFt(Number(e.target.value))}
              className="rounded-full border border-border bg-card px-2 py-1 text-xs"
              aria-label="Filter by minimum elevation"
            >
              {ELEVATION_BANDS.map((b) => (
                <option key={b.minFt} value={b.minFt}>
                  {b.label}
                </option>
              ))}
            </select>
            <select
              value={obsMaxAgeDays}
              onChange={(e) => setObsMaxAgeDays(Number(e.target.value))}
              className="rounded-full border border-border bg-card px-2 py-1 text-xs"
              aria-label="Filter by how recent"
            >
              {TIME_WINDOWS.map((w) => (
                <option key={w.maxDays} value={w.maxDays}>
                  {w.label}
                </option>
              ))}
            </select>
            {obsLoading && <span className="px-1 text-muted-foreground">Loading…</span>}
          </div>
        )}
        {obsOn && !obsLoading && observations != null && (
          <div className="max-w-[260px] rounded-2xl border border-border bg-card/90 px-3 py-2 text-xs text-muted-foreground shadow-sm backdrop-blur-sm">
            {observations.length === 0
              ? "No recent avalanche observations from UAC right now."
              : filteredObservations.length === 0
                ? `${observations.length} UAC observation${observations.length === 1 ? "" : "s"} statewide, but none match the current filters.`
                : /* Statewide points, not filtered to this location — nothing is
                     wrong if none of them happen to sit inside the current map
                     view; this caption is the only signal the user gets that the
                     layer loaded real data rather than silently doing nothing. */
                  `${filteredObservations.length} UAC observation${filteredObservations.length === 1 ? "" : "s"} loaded statewide — pan or zoom out if none are visible near this spot.`}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {showRadarToggle && radarReady && (
            <button
              onClick={() => setRadarOn((v) => !v)}
              className="rounded-full border border-border bg-card/90 px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm backdrop-blur-sm transition hover:border-primary hover:text-primary"
            >
              {radarOn ? "Hide" : "Show"} radar{radarTime ? ` (${radarTime})` : ""} · RainViewer
            </button>
          )}
          {showSnowForecastToggle && (
            <button
              onClick={() => setSnowOverlayOn((v) => !v)}
              className="rounded-full border border-border bg-card/90 px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm backdrop-blur-sm transition hover:border-primary hover:text-primary"
            >
              {snowOverlayOn ? "Hide" : "Show"} today&apos;s snow forecast (est.)
            </button>
          )}
          {showAvalancheObservationsToggle && (
            <button
              onClick={() => setObsOn((v) => !v)}
              className="rounded-full border border-border bg-card/90 px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm backdrop-blur-sm transition hover:border-primary hover:text-primary"
            >
              {obsOn ? "Hide" : "Show"} avalanche observations · UAC
            </button>
          )}
          <button
            onClick={() => setStationsOn((v) => !v)}
            className="rounded-full border border-border bg-card/90 px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm backdrop-blur-sm transition hover:border-primary hover:text-primary"
          >
            {stationsOn ? "Hide" : "Show"} weather stations{stationsLoading ? " · loading…" : ""}
          </button>
        </div>
      </div>
    </div>
  );

  return isFullscreen && typeof document !== "undefined" ? createPortal(mapContent, document.body) : mapContent;
}

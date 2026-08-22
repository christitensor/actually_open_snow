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
import { useRouter } from "next/navigation";
import type { AvalancheObservation, Webcam } from "@/lib/models/types";
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
// swappable base layers, all free/open, no key: OSM street, OpenTopoMap
// (topo, built from OSM + SRTM elevation), and Esri World Imagery
// (satellite, Esri's public tile service). All three are added as
// sources/layers up front with only one visible at a time (same pattern
// as the radar/snow-forecast toggles below) rather than swapping the
// whole style — that would blow away the pistes/radar/snow-grid layers
// added at runtime.
type BaseLayerId = "osm" | "topo" | "satellite";
const BASE_LAYER_IDS: BaseLayerId[] = ["osm", "topo", "satellite"];
const BASE_LAYER_LABELS: Record<BaseLayerId, string> = { osm: "Street", topo: "Topo", satellite: "Satellite" };

const BASE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "&copy; OpenStreetMap contributors",
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
  // Deliberately not map.isStyleLoaded(): it also factors in whether every
  // source's tiles have finished loading, so one slow/failed tile fetch
  // (e.g. a flaky connection) can leave it false long after the style
  // itself is mutation-ready — live-verified this stalls the base-layer
  // switcher indefinitely. The map's one-time "load" event is what
  // actually marks the style ready for setLayoutProperty calls.
  const styleReadyRef = useRef(false);
  const applyObservationsRef = useRef<((geojson: GeoJSON.FeatureCollection) => void) | null>(null);
  // Tracks the theme toggle (in AppHeader) so the map's OSM tiles can be
  // inverted for dark mode — this component has no other awareness of the
  // theme system, so it watches the <html> class directly.
  const isDark = useSyncExternalStore(subscribeToTheme, getIsDarkSnapshot, getIsDarkServerSnapshot);

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
          } else if (map.isStyleLoaded()) {
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
          } else if (map.isStyleLoaded()) {
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
        if (!map.isStyleLoaded()) return;
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
    const apply = () => {
      for (const id of BASE_LAYER_IDS) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", id === baseLayer ? "visible" : "none");
      }
    };
    // On mount this can fire before the initial style has finished loading
    // (setLayoutProperty throws on an unloaded style); everything after
    // mount, the style is already loaded and this runs immediately.
    if (styleReadyRef.current) apply();
    else map.once("load", apply);
  }, [baseLayer]);

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

  return (
    <div className="relative h-full w-full">
      {/* The dark-mode invert trick (see globals.css) only reads right on
          the plain OSM street tiles — inverting topo's relief colors or a
          satellite photo produces a false-color mess, so it's skipped for
          those two. */}
      <div ref={containerRef} className={`h-full w-full ${isDark && baseLayer === "osm" ? "map-dark-tiles" : ""}`} />
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
        </div>
      </div>
    </div>
  );
}

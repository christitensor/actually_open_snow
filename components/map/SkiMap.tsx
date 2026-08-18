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
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { Webcam } from "@/lib/models/types";
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
  const [baseLayer, setBaseLayer] = useState<BaseLayerId>("osm");
  // Deliberately not map.isStyleLoaded(): it also factors in whether every
  // source's tiles have finished loading, so one slow/failed tile fetch
  // (e.g. a flaky connection) can leave it false long after the style
  // itself is mutation-ready — live-verified this stalls the base-layer
  // switcher indefinitely. The map's one-time "load" event is what
  // actually marks the style ready for setLayoutProperty calls.
  const styleReadyRef = useRef(false);
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
      const popupHtml = cam.imageUrl
        ? `<strong>${cam.name}</strong><br/><img src="${cam.imageUrl}?t=${Date.now()}" alt="${cam.name}" style="width:220px;height:auto;border-radius:4px;margin-top:4px" /><br/><a href="${cam.pageUrl}" target="_blank" rel="noopener noreferrer" style="font-size:11px">Full page ↗</a>`
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
      <div className="absolute bottom-3 left-3 z-10 flex gap-2">
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
      </div>
    </div>
  );
}

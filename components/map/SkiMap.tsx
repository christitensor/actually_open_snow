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
// the base map is plain OSM raster tiles — free, no key, always works.
// Swap in a vector style (MapTiler free tier) later for MAP-01's "3D
// terrain" ambition; this gets a working map shipped first.
const OSM_RASTER_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "&copy; OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
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
  // Tracks the theme toggle (in AppHeader) so the map's OSM tiles can be
  // inverted for dark mode — this component has no other awareness of the
  // theme system, so it watches the <html> class directly.
  const isDark = useSyncExternalStore(subscribeToTheme, getIsDarkSnapshot, getIsDarkServerSnapshot);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: OSM_RASTER_STYLE,
      center,
      zoom,
    });
    mapRef.current = map;
    map.addControl(new NavigationControl(), "top-right");

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
      el.style.cssText = `width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.4);`;
      el.title = resort.snowfallTodayIn != null ? `${resort.name} — ${resort.snowfallTodayIn.toFixed(1)}" today` : resort.name;
      el.addEventListener("click", (ev) => {
        ev.stopPropagation(); // don't also trigger the map's pin-drop handler
        router.push(`/location/${resort.id}`);
      });
      new Marker({ element: el }).setLngLat([resort.lon, resort.lat]).addTo(map);
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

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className={`h-full w-full ${isDark ? "map-dark-tiles" : ""}`} />
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

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
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Webcam } from "@/lib/models/types";

interface MapPin {
  id: string;
  name: string;
  lat: number;
  lon: number;
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
}

export default function SkiMap({
  resorts,
  webcams = [],
  center,
  zoom = 9,
  showPistes = true,
  allowPinDrop = true,
}: SkiMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const router = useRouter();

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

    // Resort pins.
    for (const resort of resorts) {
      const el = document.createElement("div");
      el.style.cssText =
        "width:14px;height:14px;border-radius:50%;background:#2563eb;border:2px solid white;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.4);";
      el.title = resort.name;
      el.addEventListener("click", (ev) => {
        ev.stopPropagation(); // don't also trigger the map's pin-drop handler
        router.push(`/location/${resort.id}`);
      });
      new Marker({ element: el }).setLngLat([resort.lon, resort.lat]).addTo(map);
    }

    // Webcam pins (MAP-16) — orange, with a popup linking out to the source page.
    for (const cam of webcams) {
      const el = document.createElement("div");
      el.style.cssText =
        "width:12px;height:12px;border-radius:2px;background:#f97316;border:2px solid white;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.4);";
      el.title = cam.name;
      el.addEventListener("click", (ev) => ev.stopPropagation());
      const popup = new Popup({ offset: 12 }).setHTML(
        `<strong>${cam.name}</strong><br/><a href="${cam.pageUrl}" target="_blank" rel="noopener noreferrer">View webcam ↗</a>`
      );
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

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- map is initialized once; props are read at mount time
  }, []);

  return <div ref={containerRef} className="h-full w-full" />;
}

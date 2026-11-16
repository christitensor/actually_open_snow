import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import libertyStyle from "@/lib/map/openfreemap-liberty.json";
import darkStyle from "@/lib/map/openfreemap-dark.json";

// The map's base style: three swappable base maps, all free with no key.
//
// - Street: OpenFreeMap (https://openfreemap.org) vector tiles, which
//   are free, keyless, have no usage limits and are explicitly OK for
//   production. Vector means crisp text and roads at any zoom on any
//   display. The light look is OpenFreeMap's "Liberty" style and the dark
//   look its "Dark" style. Both use the same tile source, fonts and icon
//   sprite, so they live in one style and the theme just flips layer
//   visibility. The style layers are vendored (lib/map/openfreemap-*.json,
//   fetched Nov 2026), so an upstream style edit can't break the map; the
//   tiles themselves still come from OpenFreeMap. One local edit: the Dark
//   style's wood fill asks for a "wood-pattern" image the OFM sprite doesn't have,
//   so that fill-pattern was dropped (plain fill color instead).
// - Hillshade under the street map: AWS Open Data "Terrain Tiles"
//   (Mapzen terrarium encoding; USGS 3DEP / SRTM and others), free and
//   keyless. Without it the street map reads flat, which is useless for
//   mountains.
// - Topo: OpenTopoMap raster (contours + relief). Satellite: Esri World
//   Imagery raster.
//
// History: Street was CARTO raster until CARTO started requiring an API
// key (Nov 2026). Every tile then came back 200 OK as an "API KEY
// REQUIRED" placeholder, so nothing errored and the map just showed the
// watermark.
//
// Everything is added up front, with only one base map visible at a time.
// Swapping the whole style instead would wipe out the pistes, radar and
// snow-grid layers SkiMap adds at runtime.

export type BaseLayerId = "osm" | "topo" | "satellite";

const OFM = "https://tiles.openfreemap.org";
const HILLSHADE_SOURCE = "terrain-dem";

// Insert hillshade above land cover but below water, roads and labels.
function withHillshade(layers: LayerSpecification[], id: string, dark: boolean): LayerSpecification[] {
  const idx = layers.findIndex((l) => "source-layer" in l && ["water", "waterway", "transportation", "building"].includes(l["source-layer"] as string));
  const hillshade: LayerSpecification = {
    id,
    type: "hillshade",
    source: HILLSHADE_SOURCE,
    paint: dark
      ? { "hillshade-exaggeration": 0.3, "hillshade-shadow-color": "#000000", "hillshade-highlight-color": "#64748b", "hillshade-accent-color": "#0b0f19" }
      : { "hillshade-exaggeration": 0.35, "hillshade-shadow-color": "#5a5a5a", "hillshade-highlight-color": "#ffffff", "hillshade-accent-color": "#5a5a5a" },
  };
  const at = idx < 0 ? layers.length : idx;
  return [...layers.slice(0, at), hillshade, ...layers.slice(at)];
}

function prefixed(layers: LayerSpecification[], prefix: string, visible: boolean): LayerSpecification[] {
  return layers.map((l) => ({
    ...l,
    id: `${prefix}${l.id}`,
    layout: { ...("layout" in l ? l.layout : {}), visibility: visible ? "visible" : "none" },
  })) as LayerSpecification[];
}

const lightLayers = prefixed(withHillshade(libertyStyle.layers as LayerSpecification[], "hillshade", false), "street:", true);
const darkLayers = prefixed(withHillshade(darkStyle.layers as LayerSpecification[], "hillshade", true), "street-dark:", false);

export const STREET_LIGHT_LAYER_IDS = lightLayers.map((l) => l.id);
export const STREET_DARK_LAYER_IDS = darkLayers.map((l) => l.id);

export const BASE_STYLE: StyleSpecification = {
  version: 8,
  glyphs: `${OFM}/fonts/{fontstack}/{range}.pbf`,
  sprite: `${OFM}/sprites/ofm_f384/ofm`,
  sources: {
    openmaptiles: { type: "vector", url: `${OFM}/planet` },
    ne2_shaded: {
      type: "raster",
      tiles: [`${OFM}/natural_earth/ne2sr/{z}/{x}/{y}.png`],
      tileSize: 256,
      maxzoom: 6,
    },
    [HILLSHADE_SOURCE]: {
      type: "raster-dem",
      tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
      encoding: "terrarium",
      tileSize: 256,
      maxzoom: 15,
      attribution: "Terrain: Mapzen / AWS Terrain Tiles (USGS, SRTM)",
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
      // Esri's public World Imagery tile service. Free, no key, and note the {z}/{y}/{x} order (not the usual {z}/{x}/{y}).
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    },
  },
  layers: [
    ...lightLayers,
    ...darkLayers,
    { id: "topo", type: "raster", source: "topo", layout: { visibility: "none" } },
    { id: "satellite", type: "raster", source: "satellite", layout: { visibility: "none" } },
  ],
};

/** Which style layers should be visible for a base map + theme. */
export function visibleBaseLayerIds(base: BaseLayerId, isDark: boolean): Set<string> {
  if (base === "osm") return new Set(isDark ? STREET_DARK_LAYER_IDS : STREET_LIGHT_LAYER_IDS);
  return new Set([base]);
}

export const ALL_BASE_LAYER_IDS = [...STREET_LIGHT_LAYER_IDS, ...STREET_DARK_LAYER_IDS, "topo", "satellite"];

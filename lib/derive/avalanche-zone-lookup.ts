// BC-02: pure point-in-polygon lookup against avalanche.org's zone
// boundaries. Kept separate from lib/data-sources/avalanche-org.ts so the
// matching logic is unit-testable without a network call.

import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import type { AvalancheZoneMapLayer } from "@/lib/data-sources/avalanche-org";
import type { AvalancheZone } from "@/lib/models/types";

// avalanche.org's zone polygons aren't contiguous — there are real gaps
// between adjacent zones (live-verified: a Park City coordinate, which is
// squarely backcountry terrain, matches no polygon at all even though
// it's a few hundred yards from the Salt Lake zone boundary). A strict
// point-in-polygon miss shouldn't mean "no avalanche zone" for a point
// that's obviously in one; snap to the nearest zone if it's close enough
// that the miss is clearly a boundary/gap artifact, not a genuinely
// uncovered area (e.g. the Utah desert).
const NEAREST_ZONE_FALLBACK_MAX_MILES = 8;

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Coarse point-to-polygon distance: nearest vertex, not the true nearest
 * edge point — close enough for an 8-mile gap-snapping threshold without
 * pulling in a full geometry library. */
function minVertexDistanceMiles(lat: number, lon: number, geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): number {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let min = Infinity;
  for (const rings of polygons) {
    for (const ring of rings) {
      for (const [vLon, vLat] of ring) {
        const d = haversineMiles(lat, lon, vLat, vLon);
        if (d < min) min = d;
      }
    }
  }
  return min;
}

export function findZoneForPoint(
  mapLayer: AvalancheZoneMapLayer,
  lat: number,
  lon: number
): AvalancheZone | null {
  const pt = point([lon, lat]);
  let nearest: { feature: AvalancheZoneMapLayer["features"][number]; distanceMiles: number } | null = null;

  for (const feature of mapLayer.features) {
    try {
      const geometry = feature.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;
      if (booleanPointInPolygon(pt, geometry)) {
        return {
          zoneId: String(feature.id),
          centerName: feature.properties.center,
          zoneName: feature.properties.name,
        };
      }
      const distanceMiles = minVertexDistanceMiles(lat, lon, geometry);
      if (!nearest || distanceMiles < nearest.distanceMiles) {
        nearest = { feature, distanceMiles };
      }
    } catch {
      // Skip malformed/non-polygon geometries rather than failing the whole lookup
      continue;
    }
  }

  if (nearest && nearest.distanceMiles <= NEAREST_ZONE_FALLBACK_MAX_MILES) {
    return {
      zoneId: String(nearest.feature.id),
      centerName: nearest.feature.properties.center,
      zoneName: nearest.feature.properties.name,
    };
  }
  return null;
}

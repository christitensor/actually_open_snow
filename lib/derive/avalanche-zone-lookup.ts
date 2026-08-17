// BC-02: pure point-in-polygon lookup against avalanche.org's zone
// boundaries. Kept separate from lib/data-sources/avalanche-org.ts so the
// matching logic is unit-testable without a network call.

import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import type { AvalancheZoneMapLayer } from "@/lib/data-sources/avalanche-org";
import type { AvalancheZone } from "@/lib/models/types";

export function findZoneForPoint(
  mapLayer: AvalancheZoneMapLayer,
  lat: number,
  lon: number
): AvalancheZone | null {
  const pt = point([lon, lat]);

  for (const feature of mapLayer.features) {
    try {
      if (booleanPointInPolygon(pt, feature.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon)) {
        return {
          zoneId: String(feature.id),
          centerName: feature.properties.center,
          zoneName: feature.properties.name,
        };
      }
    } catch {
      // Skip malformed/non-polygon geometries rather than failing the whole lookup
      continue;
    }
  }
  return null;
}

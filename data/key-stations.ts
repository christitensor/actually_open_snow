// Curated high-elevation weather stations that local backcountry
// skiers/avalanche forecasters actually check — as distinct from
// lib/data-sources/nws.ts's getNearbyStations, which returns whatever's
// physically closest to a point and in practice is almost always a
// valley/airport ASOS station (live-verified: for a Logan Canyon
// backcountry coordinate, the "nearest 10" are all airports — Logan-Cache,
// Ogden-Hinckley, Provo, etc — none of which tell you anything about
// conditions at elevation).
//
// Sourced from a real backcountry-skier reference doc (Bear River Range
// list), then verified against api.weather.gov/stations/{id} to confirm
// each is a real, currently-reporting station reachable through the same
// free NWS API this app already uses (no new API key/vendor needed) —
// these are RAWS/co-op sites that happen to also be in NWS's network, not
// a separate data source.
//
// Keyed by avalanche.org zone ID (AvalancheZone.zoneId from
// lib/derive/avalanche-zone-lookup.ts) so a location's dashboard can look
// up "does this UAC zone have curated stations" the same way it already
// looks up the zone's avalanche forecast. Only zones with a real,
// verified list should be added here — an empty/guessed list is worse
// than the generic nearest-station fallback.
//
// Not included: Logan Peak (9,714') — the other station on the source
// list — because it's a standalone Campbell Scientific datalogger
// (weather.campbellsci.com), not part of NWS's network, and would need
// its own separate, more fragile scrape. Flagged here rather than
// silently omitted.

export interface KeyStation {
  /** api.weather.gov station identifier */
  nwsId: string;
  name: string;
  elevationFt: number;
}

export interface ZoneKeyStations {
  /** Matches AvalancheZone.zoneId (avalanche.org's numeric zone id, as a string) */
  avalancheZoneId: string;
  /** Human label for the zone/range, used in the UI heading */
  rangeName: string;
  stations: KeyStation[];
}

export const KEY_STATIONS_BY_ZONE: ZoneKeyStations[] = [
  {
    avalancheZoneId: "1736", // Utah Avalanche Center — Logan zone
    rangeName: "Bear River Range",
    stations: [
      { nwsId: "CRDUT", name: "Card Canyon", elevationFt: 8700 },
      { nwsId: "PRSUT", name: "Paris Peak", elevationFt: 9541 },
      { nwsId: "TGLU1", name: "Tony Grove", elevationFt: 8400 },
    ],
  },
];

export function getKeyStationsForZone(zoneId: string | null | undefined): ZoneKeyStations | null {
  if (!zoneId) return null;
  return KEY_STATIONS_BY_ZONE.find((z) => z.avalancheZoneId === zoneId) ?? null;
}

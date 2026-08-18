// Curated high-elevation weather stations that local backcountry
// skiers/avalanche forecasters actually check — as distinct from
// lib/data-sources/nws.ts's getNearbyStations, which returns whatever's
// physically closest to a point and in practice is almost always a
// valley/airport ASOS station (live-verified: for a Logan Canyon
// backcountry coordinate, the "nearest 10" are all airports — Logan-Cache,
// Ogden-Hinckley, Provo, etc — none of which tell you anything about
// conditions at elevation).
//
// Originally seeded from a real backcountry-skier reference doc (Bear
// River Range list). Extended to every avalanche.org zone this app's
// resorts fall in — Logan, Ogden, Salt Lake, Provo, Uintas (Utah
// Avalanche Center), and Tetons (Bridger-Teton Avalanche Center, for
// Grand Targhee) — by pulling the *complete* NWS station list for UT/ID/WY
// (api.weather.gov/stations?state=..., paginated past its 500-result
// page size — the single-page version misses stations, which is why an
// earlier pass wrongly concluded Logan Peak wasn't in NWS's network: it
// was simply past the first page), point-in-polygon matching each
// station against avalanche.org's own zone boundaries
// (lib/derive/avalanche-zone-lookup.ts), then ranking by elevation to
// separate real mountain/RAWS/study-plot stations from valley ASOS
// stations. Every station below was individually verified live via
// api.weather.gov/stations/{id}/observations/latest to confirm it's
// real and currently reporting, not just present in a stale list.
//
// Not covered: Pebble Creek, Kelly Canyon, and Pomerelle (SE Idaho
// resorts in data/resorts.ts) don't fall inside any avalanche.org
// forecast zone at all — there's no avalanche center for that part of
// Idaho, so there's no zone to key curated stations off of. Flagged
// here rather than silently unhandled; a resort-keyed (not zone-keyed)
// fallback would be needed to cover them.

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
      { nwsId: "LGP", name: "Logan Peak", elevationFt: 9714 },
      { nwsId: "PRSUT", name: "Paris Peak", elevationFt: 9541 },
      { nwsId: "CRDUT", name: "Card Canyon", elevationFt: 8715 },
      { nwsId: "TGLU1", name: "Tony Grove", elevationFt: 8438 },
    ],
  },
  {
    avalancheZoneId: "1737", // Utah Avalanche Center — Ogden zone
    rangeName: "Ogden Range",
    stations: [
      { nwsId: "OGP", name: "Snowbasin — Mount Ogden", elevationFt: 9570 },
      { nwsId: "MCRU1", name: "Monte Cristo", elevationFt: 8931 },
      { nwsId: "PWDU1", name: "Powder Mountain", elevationFt: 8505 },
    ],
  },
  {
    avalancheZoneId: "1738", // Utah Avalanche Center — Salt Lake zone
    rangeName: "Salt Lake / Park City",
    stations: [
      { nwsId: "AMB", name: "Alta — Mt Baldy", elevationFt: 11066 },
      { nwsId: "BRW", name: "Brighton — Great Western", elevationFt: 10565 },
      { nwsId: "PKC", name: "Park City — Jupiter", elevationFt: 10015 },
    ],
  },
  {
    avalancheZoneId: "1739", // Utah Avalanche Center — Provo zone
    rangeName: "Provo / Timpanogos",
    stations: [
      { nwsId: "CSC", name: "Cascade Peak", elevationFt: 10875 },
      { nwsId: "TIMU1", name: "Timpanogos Divide", elevationFt: 8170 },
      { nwsId: "PC010", name: "Sundance", elevationFt: 6435 },
    ],
  },
  {
    avalancheZoneId: "1740", // Utah Avalanche Center — Uintas zone
    rangeName: "Uinta Mountains",
    stations: [
      { nwsId: "LOFTY", name: "Lofty Lake Peak", elevationFt: 11186 },
      { nwsId: "UTBMP", name: "Bald Mountain Pass", elevationFt: 10727 },
      { nwsId: "TRLU1", name: "Trial Lake", elevationFt: 9945 },
    ],
  },
  {
    avalancheZoneId: "2855", // Bridger-Teton Avalanche Center — Tetons zone (Grand Targhee)
    rangeName: "Teton Range",
    stations: [
      { nwsId: "GTHW4", name: "Grand Targhee", elevationFt: 9260 },
      { nwsId: "KTET", name: "Teton Pass", elevationFt: 8428 },
    ],
  },
];

export function getKeyStationsForZone(zoneId: string | null | undefined): ZoneKeyStations | null {
  if (!zoneId) return null;
  return KEY_STATIONS_BY_ZONE.find((z) => z.avalancheZoneId === zoneId) ?? null;
}

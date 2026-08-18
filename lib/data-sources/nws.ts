// NWS/NOAA client (api.weather.gov) — free, no API key, but requires a
// descriptive User-Agent per NWS API policy. US coverage only.
// Backs SEV-01 (alerts), FC-10 (snowLevel gridpoint field), DATA-01 (stations).

import type { NwsAlert, SnowLevelPoint } from "@/lib/models/types";

const BASE = "https://api.weather.gov";

// NWS asks that the User-Agent identify the application and a contact —
// update the contact before any production deploy.
const USER_AGENT = "actually-open-snow (github.com/christitensor/actually_open_snow)";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/geo+json" },
    next: { revalidate: 900 },
  });
  if (!res.ok) {
    throw new Error(`NWS request failed (${res.status}): ${url}`);
  }
  return res.json() as Promise<T>;
}

interface PointsResponse {
  properties: {
    cwa: string; // WFO office id, e.g. "SLC"
    gridId: string;
    gridX: number;
    gridY: number;
    forecastGridData: string;
    forecast: string;
    forecastHourly: string;
    observationStations: string;
  };
}

export interface NwsPointMeta {
  wfo: string;
  gridId: string;
  gridX: number;
  gridY: number;
  forecastGridDataUrl: string;
  observationStationsUrl: string;
}

/** Resolves a lat/lon to its NWS grid — required before any other NWS call. */
export async function getPointMeta(lat: number, lon: number): Promise<NwsPointMeta> {
  const url = `${BASE}/points/${lat.toFixed(4)},${lon.toFixed(4)}`;
  const raw = await fetchJson<PointsResponse>(url);
  return {
    wfo: raw.properties.cwa,
    gridId: raw.properties.gridId,
    gridX: raw.properties.gridX,
    gridY: raw.properties.gridY,
    forecastGridDataUrl: raw.properties.forecastGridData,
    observationStationsUrl: raw.properties.observationStations,
  };
}

interface GridpointValue {
  validTime: string; // e.g. "2026-01-01T00:00:00+00:00/PT6H"
  value: number | null;
}

interface GridpointResponse {
  properties: {
    snowLevel?: { uom: string; values: GridpointValue[] };
  };
}

/**
 * FC-10 primary source: NWS gridpoint `snowLevel` — a direct forecast field
 * for the elevation (meters) where precip transitions rain/snow. No formula
 * needed, unlike most of this app's "derived" features.
 */
export async function getSnowLevel(lat: number, lon: number): Promise<SnowLevelPoint[]> {
  const meta = await getPointMeta(lat, lon);
  const raw = await fetchJson<GridpointResponse>(meta.forecastGridDataUrl);
  const values = raw.properties.snowLevel?.values ?? [];

  return values.map((v) => {
    const startTime = v.validTime.split("/")[0];
    const meters = v.value;
    return {
      time: startTime,
      snowLevelFt: meters != null ? Math.round(meters * 3.28084) : null,
      freezingLevelFt: null, // filled in by lib/derive/snow-level.ts when corroborating with Open-Meteo
    };
  });
}

interface AlertsResponse {
  features: {
    properties: {
      id: string;
      event: string;
      headline: string;
      severity: string;
      urgency: string;
      areaDesc: string;
      effective: string;
      expires: string;
    };
  }[];
}

/** SEV-01: active NWS alerts (severe weather, avalanche, wind, etc.) for a point. */
export async function getActiveAlerts(lat: number, lon: number): Promise<NwsAlert[]> {
  const url = `${BASE}/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`;
  const raw = await fetchJson<AlertsResponse>(url);
  return raw.features.map((f) => ({
    id: f.properties.id,
    event: f.properties.event,
    headline: f.properties.headline,
    severity: f.properties.severity,
    urgency: f.properties.urgency,
    areaDesc: f.properties.areaDesc,
    effective: f.properties.effective,
    expires: f.properties.expires,
  }));
}

interface StationsResponse {
  features: {
    properties: {
      stationIdentifier: string;
      name: string;
    };
    geometry: { coordinates: [number, number] }; // [lon, lat]
  }[];
}

export interface NwsStation {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

/** DATA-01: nearby NWS observation stations for a point's grid. Ordered by
 * NWS's own relevance ranking, not distance — in practice this is almost
 * always valley/airport ASOS stations (live-verified), which is why
 * data/key-stations.ts exists as a curated alternative for zones that
 * have one. */
export async function getNearbyStations(lat: number, lon: number): Promise<NwsStation[]> {
  const meta = await getPointMeta(lat, lon);
  const raw = await fetchJson<StationsResponse>(meta.observationStationsUrl);
  return raw.features.slice(0, 10).map((f) => ({
    id: f.properties.stationIdentifier,
    name: f.properties.name,
    lat: f.geometry.coordinates[1],
    lon: f.geometry.coordinates[0],
  }));
}

interface StationObservationResponse {
  properties: {
    timestamp: string;
    temperature: { value: number | null };
    windSpeed: { value: number | null }; // km/h per NWS API (wmoUnit:km_h-1)
    windDirection: { value: number | null };
  };
}

export interface NwsStationObservation {
  tempF: number | null;
  windSpeedMph: number | null;
  windDirectionDeg: number | null;
  timestamp: string;
}

/** Latest observation for a specific, known station identifier (e.g. a
 * curated key station) — as opposed to getNearbyStations, which discovers
 * stations by proximity to a point. */
export async function getStationObservation(stationId: string): Promise<NwsStationObservation | null> {
  const raw = await fetchJson<StationObservationResponse>(`${BASE}/stations/${stationId}/observations/latest`);
  const p = raw.properties;
  return {
    tempF: p.temperature.value != null ? (p.temperature.value * 9) / 5 + 32 : null,
    windSpeedMph: p.windSpeed.value != null ? p.windSpeed.value * 0.621371 : null,
    windDirectionDeg: p.windDirection.value,
    timestamp: p.timestamp,
  };
}

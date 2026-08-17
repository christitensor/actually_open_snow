// Coordinate-first location model — see ARCHITECTURE.md "Data flow".
// A resort is just a named, curated coordinate; a backcountry pin is an
// uncurated one. Every data client below takes { lat, lon } and nothing else.

export type LocationSource = "resort" | "pin";

export interface Location {
  lat: number;
  lon: number;
  source: LocationSource;
  /** Set when source === "resort" — key into resorts.json */
  resortId?: string;
  /** Human-readable label, e.g. resort name or "Custom Pin" */
  name: string;
  elevationFt?: number;
}

export interface Resort {
  id: string;
  name: string;
  region: "Northern Utah" | "Southeast Idaho";
  lat: number;
  lon: number;
  baseElevationFt: number;
  midElevationFt?: number;
  summitElevationFt: number;
}

export interface HourlyForecastPoint {
  time: string; // ISO 8601
  temperatureF: number;
  relativeHumidityPct: number;
  precipitationIn: number;
  snowfallIn: number;
  windSpeedMph: number;
  windGustMph: number;
  weatherCode: number;
}

export interface DailyForecastDay {
  date: string; // YYYY-MM-DD
  tempMaxF: number;
  tempMinF: number;
  precipitationSumIn: number;
  snowfallSumIn: number;
  windSpeedMaxMph: number;
  weatherCode: number;
}

export interface ForecastResponse {
  location: { lat: number; lon: number };
  generatedAt: string;
  hourly: HourlyForecastPoint[];
  daily: DailyForecastDay[];
  source: "open-meteo";
}

export interface SnowLevelPoint {
  time: string;
  snowLevelFt: number | null; // NWS gridpoint snowLevel, converted to feet
  freezingLevelFt: number | null; // Open-Meteo freezing_level_height, converted to feet
}

export interface SnowLevelResponse {
  location: { lat: number; lon: number };
  points: SnowLevelPoint[];
  /** Only present when the point falls inside an NWS forecast zone (US only) */
  nwsAvailable: boolean;
}

export interface ElevationResponse {
  lat: number;
  lon: number;
  elevationFt: number;
  source: "open-meteo-elevation";
}

export interface NwsAlert {
  id: string;
  event: string;
  headline: string;
  severity: string;
  urgency: string;
  areaDesc: string;
  effective: string;
  expires: string;
}

export interface AvalancheZone {
  zoneId: string;
  centerName: string;
  zoneName: string;
}

export interface AvalancheForecast {
  zoneId: string;
  dangerAboveTreeline: number | null;
  dangerNearTreeline: number | null;
  dangerBelowTreeline: number | null;
  summary: string;
  issuedAt: string;
  expiresAt: string;
  url: string;
}

export interface SnotelStation {
  stationTriplet: string;
  name: string;
  lat: number;
  lon: number;
  elevationFt: number;
  distanceMi: number;
}

export interface SnotelReading {
  station: SnotelStation;
  date: string;
  snowDepthIn: number | null;
  sweIn: number | null;
}

export interface AfdProduct {
  wfo: string;
  issuedAt: string;
  text: string;
}

export interface ConditionsSummary {
  location: { lat: number; lon: number };
  generatedAt: string;
  narrative: string;
  corroboration: {
    modelsAgree: boolean;
    modelSpreadIn: number | null;
    afdMentionsUncertainty: boolean;
    recentSnotelMatchesForecast: boolean | null;
  };
}

export interface Webcam {
  id: string;
  name: string;
  resortId?: string;
  lat: number;
  lon: number;
  /** Direct hotlinkable image URL, when verified — not yet confirmed for any seed entry, see data/webcams.ts */
  imageUrl?: string;
  pageUrl: string;
  source: "resort" | "udot" | "idaho-511";
}

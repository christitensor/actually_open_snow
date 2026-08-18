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
  /** Resort base/summit, when known — bounds the elevation-adjuster slider (ElevationAdjuster.tsx). Pins fall back to elevationFt +/- a fixed range. */
  minElevationFt?: number;
  maxElevationFt?: number;
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
  windDirectionDeg: number;
  weatherCode: number;
  freezingLevelFt: number;
}

export interface DailyForecastDay {
  date: string; // YYYY-MM-DD
  tempMaxF: number;
  tempMinF: number;
  precipitationSumIn: number;
  snowfallSumIn: number;
  windSpeedMaxMph: number;
  windGustMaxMph: number;
  windDirectionDominantDeg: number;
  weatherCode: number;
}

/** A lightweight, elevation-overridden daily forecast — see FC-10-adj (elevation adjuster). Not the full ForecastResponse: no hourly block, no wind. */
export interface ElevationAdjustedDay {
  date: string;
  tempMaxF: number;
  tempMinF: number;
  precipitationSumIn: number;
  snowfallSumIn: number;
}

export interface ForecastResponse {
  location: { lat: number; lon: number };
  generatedAt: string;
  hourly: HourlyForecastPoint[];
  daily: DailyForecastDay[];
  source: "open-meteo";
  /** Seconds east of UTC for this location (e.g. -21600 for MDT) — lets callers build a correct absolute timestamp from a local wall-clock string, since `hourly`/`daily` times carry no offset of their own (Open-Meteo's `timezone=auto`). */
  utcOffsetSeconds: number;
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

/** FC-10 per-day rollup for the daily forecast table — afternoon snow line for each forecast date. */
export interface DailySnowLine {
  date: string;
  snowLineFt: number | null;
  source: "nws" | "estimated";
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

export interface AirQuality {
  location: { lat: number; lon: number };
  currentUsAqi: number | null;
  currentPm25: number | null;
  currentPm10: number | null;
  forecastUsAqi: { time: string; usAqi: number | null }[];
}

export interface HistoricalDay {
  date: string;
  tempMaxF: number;
  tempMinF: number;
  precipitationSumIn: number;
  snowfallSumIn: number;
}

/** PERS-03: an email-based snow alert subscription. No accounts/login — subscribe by email + location, like a mailing list. */
export interface AlertSubscription {
  id: number;
  email: string;
  locationName: string;
  lat: number;
  lon: number;
  thresholdIn: number;
  unsubscribeToken: string;
  createdAt: string;
  lastNotifiedDate: string | null;
}

export interface Webcam {
  id: string;
  name: string;
  resortId?: string;
  lat: number;
  lon: number;
  /** Direct hotlinkable still-image URL, when verified — see data/webcams.ts for how each was found. */
  imageUrl?: string;
  /** Embeddable live-video URL (YouTube livestream `embed/{id}`, etc.), when a resort publishes its cams that way instead of a still image. At most one of imageUrl/videoEmbedUrl is set per entry. */
  videoEmbedUrl?: string;
  pageUrl: string;
  source: "resort" | "udot" | "idaho-511";
}

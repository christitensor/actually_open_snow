// FC-10-adj server side: gathers the (elevation-independent) inputs the
// slider's model needs, once per page. lib/derive/elevation-snow.ts does
// the math, in the browser. Kept separate so that module stays free of
// data-source imports.

import { getForecast } from "@/lib/data-sources/open-meteo";
import { getNwsPrecipForecast } from "@/lib/data-sources/nws";
import { getPrecipGradient } from "@/lib/data-sources/snotel";
import type { ElevationModelInputs, ForecastResponse } from "@/lib/models/types";

/** @param forecast pass the dashboard's already-fetched forecast to avoid a second Open-Meteo call. */
export async function getElevationModelInputs(lat: number, lon: number, forecast?: ForecastResponse): Promise<ElevationModelInputs> {
  const [fc, nws, gradient] = await Promise.all([
    forecast ?? getForecast(lat, lon),
    getNwsPrecipForecast(lat, lon).catch(() => null), // outside the US, or NWS down: Open-Meteo-only
    getPrecipGradient(lat, lon),
  ]);
  return {
    utcOffsetSeconds: fc.utcOffsetSeconds,
    openMeteo: {
      refElevationFt: fc.modelElevationFt,
      hourly: fc.hourly.map((h) => ({
        time: h.time,
        temperatureF: h.temperatureF,
        precipitationIn: h.precipitationIn,
        freezingLevelFt: h.freezingLevelFt,
      })),
    },
    nws: nws && nws.periods.length > 0 ? nws : null,
    gradient,
  };
}

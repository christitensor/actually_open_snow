// SNOW-03: multi-source corroborated conditions summary. This is the
// stand-in for OpenSnow's human-written "Daily Snow" forecaster posts
// (EXP-01) — instead of one editorial voice, it reconciles NOAA's own
// forecaster-written Area Forecast Discussion (AFD) text against our
// multi-model snowfall spread and the nearest SNOTEL station's latest
// observation, and says plainly where sources agree or disagree rather
// than silently picking one number.
//
// Template-based, not LLM-generated — no LLM API is wired into this app.

import { afdMentionsUncertainty } from "@/lib/data-sources/nws-products";
import type {
  AfdProduct,
  ConditionsSummary,
  ForecastResponse,
  SnotelReading,
} from "@/lib/models/types";

const MODEL_AGREEMENT_THRESHOLD_IN = 2;

export interface ConditionsSummaryInputs {
  location: { lat: number; lon: number; name: string };
  forecast: ForecastResponse;
  multiModelTodaySnowfallIn: number[]; // one value per model, today's forecast
  afd: AfdProduct | null;
  recentSnotel: SnotelReading | null;
}

export function buildConditionsSummary(inputs: ConditionsSummaryInputs): ConditionsSummary {
  const { location, forecast, multiModelTodaySnowfallIn, afd, recentSnotel } = inputs;

  const today = forecast.daily[0];
  const tomorrow = forecast.daily[1];

  const spread =
    multiModelTodaySnowfallIn.length > 1
      ? Math.max(...multiModelTodaySnowfallIn) - Math.min(...multiModelTodaySnowfallIn)
      : null;
  const modelsAgree = spread != null ? spread <= MODEL_AGREEMENT_THRESHOLD_IN : true;

  const afdUncertain = afd ? afdMentionsUncertainty(afd.text) : false;

  const parts: string[] = [];

  parts.push(
    `${location.name}: ${today.snowfallSumIn.toFixed(1)}" of new snow forecast today, ` +
      `${tomorrow ? tomorrow.snowfallSumIn.toFixed(1) : "—"}" tomorrow.`
  );

  if (spread != null) {
    if (modelsAgree) {
      parts.push(`Models are in good agreement on totals (spread of ${spread.toFixed(1)}").`);
    } else {
      parts.push(
        `Models disagree on today's total — a spread of ${spread.toFixed(1)}" across models, ` +
          `so treat the exact number as a range rather than a point forecast.`
      );
    }
  }

  if (afd) {
    parts.push(
      afdUncertain
        ? `The local NWS forecast discussion flags some uncertainty in this forecast — worth a second look before committing to plans.`
        : `The local NWS forecast discussion is consistent with this outlook.`
    );
  } else {
    parts.push(`No NWS forecast discussion available for this location (likely outside US coverage).`);
  }

  if (recentSnotel) {
    parts.push(
      `Nearest SNOTEL station (${recentSnotel.station.name}, ${recentSnotel.station.distanceMi.toFixed(
        1
      )} mi away) last reported ` +
        `${recentSnotel.snowDepthIn != null ? `${recentSnotel.snowDepthIn}" snow depth` : "no snow depth reading"}` +
        `${recentSnotel.sweIn != null ? ` and ${recentSnotel.sweIn}" SWE` : ""} as of ${recentSnotel.date}.`
    );
  }

  return {
    location: { lat: location.lat, lon: location.lon },
    generatedAt: new Date().toISOString(),
    narrative: parts.join(" "),
    corroboration: {
      modelsAgree,
      modelSpreadIn: spread,
      afdMentionsUncertainty: afdUncertain,
      // Comparing forecast skill against actual SNOTEL trend needs a stored
      // forecast history (yesterday's forecast vs. today's actual) that
      // this app doesn't persist yet — left null rather than faked.
      recentSnotelMatchesForecast: null,
    },
  };
}

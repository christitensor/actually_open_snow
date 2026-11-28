// FC-13 (issue #28): split a ski day's snowfall into the part that falls
// overnight — 5pm the previous day through 8am, i.e. what's already on the
// ground at first chair — and the part that falls during the ski day
// itself, 8am through 5pm.
//
// Computed from Open-Meteo's raw hourly snowfall, deliberately NOT rescaled
// to the elevation-adjusted daily total shown in the forecast table: the
// split answers "when does it fall", the headline number answers "how much
// at your elevation". The evening block (5pm-midnight) belongs to the NEXT
// day's overnight, so a calendar day's parts won't sum to that day's total.
//
// One asymmetry: the hourly feed starts at midnight today, so the first
// forecast day's overnight only reaches back to midnight, not 5pm.

import type { HourlyForecastPoint } from "@/lib/models/types";

export interface DayNightSplit {
  overnightIn: number;
  daytimeIn: number;
}

export const OVERNIGHT_START_HOUR = 17; // 5pm
export const DAY_START_HOUR = 8; // 8am
export const DAY_END_HOUR = 17; // 5pm

function prevDateStr(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function splitDayNightSnow(
  hourly: HourlyForecastPoint[],
  date: string
): DayNightSplit {
  const prev = prevDateStr(date);
  let overnightIn = 0;
  let daytimeIn = 0;
  for (const h of hourly) {
    const day = h.time.slice(0, 10);
    const hour = Number(h.time.slice(11, 13));
    if (
      (day === prev && hour >= OVERNIGHT_START_HOUR) ||
      (day === date && hour < DAY_START_HOUR)
    ) {
      overnightIn += h.snowfallIn;
    } else if (day === date && hour >= DAY_START_HOUR && hour < DAY_END_HOUR) {
      daytimeIn += h.snowfallIn;
    }
  }
  return { overnightIn, daytimeIn };
}

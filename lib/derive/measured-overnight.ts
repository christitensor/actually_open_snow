// PERS-06: MEASURED overnight new snow — what the wake-up push and the
// iOS Shortcut powder check decide on. Deliberately never falls back to a
// forecast/model number: a false 5am wake-up is worse than none, and the
// owner asked for measured snowfall, not a forecast.
//
// Source order:
// 1. The resort's own published report (ski patrol's measured "Overnight"),
//    but only if it was updated today (Mountain Time) — at 4-5am most
//    resorts haven't posted yet, and yesterday's number is the wrong night.
// 2. SNOTEL: measured snow-depth rise since 5pm at the nearest stations
//    (≤15 mi), averaged. Works for any point in UT/ID, including
//    backcountry pins and resorts with no parseable report.
// 3. Nothing measured available → snowfallIn null. Callers treat that as
//    "don't wake anyone", never as a forecast fallback.

import { resorts } from "@/data/resorts";
import { getResortSnowReport, hasResortReport, type ResortSnowReport } from "@/lib/data-sources/resort-reports";
import { getOvernightDepthGains, type OvernightDepthGain } from "@/lib/data-sources/snotel";
import { haversineMiles } from "@/lib/util/geo";

const TZ = "America/Denver";
const OVERNIGHT_START_HOUR = 17;

export interface MeasuredOvernight {
  /** Measured overnight new snow in inches, or null if no measured source was available. */
  snowfallIn: number | null;
  source: "resort-report" | "snotel" | "none";
  /** Today's date in Mountain Time — the once-per-day dedup key. */
  localDate: string;
  windowStart: string;
  resortReport?: ResortSnowReport & { fresh: boolean };
  snotel?: OvernightDepthGain[];
  notes: string[];
}

function localDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

function denverOffsetHours(d: Date): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" }).formatToParts(d).find((p) => p.type === "timeZoneName")?.value;
  const m = name?.match(/GMT([+-])(\d{2}):(\d{2})/);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) + Number(m[3]) / 60) : -7;
}

/** 5pm Mountain Time on the evening that started the current overnight window. */
export function overnightWindowStart(now = new Date()): Date {
  const offset = denverOffsetHours(now);
  const localNow = new Date(now.getTime() + offset * 3600 * 1000); // read with getUTC* = Mountain wall clock
  const dayShift = localNow.getUTCHours() >= OVERNIGHT_START_HOUR ? 0 : -1;
  const startLocalMs = Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate() + dayShift, OVERNIGHT_START_HOUR);
  return new Date(startLocalMs - offset * 3600 * 1000);
}

/** Curated resort at (essentially) these coordinates, so a lat/lon caller still gets the resort's own report. */
export function resortAt(lat: number, lon: number) {
  return resorts.find((r) => haversineMiles(lat, lon, r.lat, r.lon) < 0.5);
}

export async function getMeasuredOvernight(lat: number, lon: number, resortId?: string, now = new Date()): Promise<MeasuredOvernight> {
  const today = localDate(now);
  const windowStart = overnightWindowStart(now);
  const notes: string[] = [];
  const result: MeasuredOvernight = { snowfallIn: null, source: "none", localDate: today, windowStart: windowStart.toISOString(), notes };

  const id = resortId ?? resortAt(lat, lon)?.id;
  // A report page only shows its current numbers, so skip it when replaying a past morning.
  const isLive = Math.abs(Date.now() - now.getTime()) < 3600 * 1000;
  if (id && isLive && hasResortReport(id)) {
    try {
      const report = await getResortSnowReport(id, now);
      if (report) {
        const fresh = report.updatedLocalDate === today;
        result.resortReport = { ...report, fresh };
        if (fresh) {
          result.snowfallIn = report.overnightIn;
          result.source = "resort-report";
          return result;
        }
        notes.push(`Resort report not updated yet today (last updated ${report.updatedLocalDate}) — using SNOTEL instead.`);
      }
    } catch (err) {
      notes.push(`Resort report unavailable: ${err instanceof Error ? err.message : "unknown error"} — using SNOTEL instead.`);
    }
  }

  try {
    const gains = await getOvernightDepthGains(lat, lon, windowStart, { now });
    result.snotel = gains;
    if (gains.length > 0) {
      const avg = gains.reduce((sum, g) => sum + g.gainIn, 0) / gains.length;
      result.snowfallIn = Math.round(avg * 10) / 10;
      result.source = "snotel";
    } else {
      notes.push("No SNOTEL station with current data within 15 miles.");
    }
  } catch (err) {
    notes.push(`SNOTEL unavailable: ${err instanceof Error ? err.message : "unknown error"}.`);
  }
  return result;
}

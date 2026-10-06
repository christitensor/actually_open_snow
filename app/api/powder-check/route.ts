import { NextRequest, NextResponse } from "next/server";
import { getResortById } from "@/data/resorts";
import { getMeasuredOvernight } from "@/lib/derive/measured-overnight";
import { parseLatLon } from "@/lib/util/api";

// PERS-06 companion for iOS Shortcuts: iOS has no "when a notification
// arrives" automation trigger, so a Shortcut can't react to the wake-up
// push itself. Instead a daily "Time of Day" automation (~6am) calls
// this and turns on an alarm when the answer is YES — no push needed.
//
//   GET /api/powder-check?resort=snowbasin&min=6   (or ?lat=&lon=&min=)
//
// Plain-text "YES" / "NO" by default, because "If Contents of URL is YES"
// is the simplest possible Shortcut condition; ?format=json for details.
// MEASURED snow only (resort patrol report, else SNOTEL depth sensors —
// see lib/derive/measured-overnight.ts), never a forecast. If nothing
// measured is available the answer is NO, so a data outage can't ring
// an alarm on a dry morning.
// Add &test=1 to force YES while setting the Shortcut up.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const resortId = params.get("resort");
  const resort = resortId ? getResortById(resortId) : undefined;
  // parseLatLon reads a missing param as 0 — require both explicitly, or a
  // typo'd URL would silently check the Gulf of Guinea and answer "NO".
  const hasLatLon = params.has("lat") && params.has("lon");
  const point = resort ? { lat: resort.lat, lon: resort.lon } : !resortId && hasLatLon ? parseLatLon(params) : null;
  const min = Number(params.get("min") ?? 6);
  const asJson = params.get("format") === "json";
  // ?at=<ISO time> replays a past morning (SNOTEL only — a resort's report
  // page only ever shows its current numbers), for checking accuracy
  // against storms you remember.
  const at = params.get("at") ? new Date(params.get("at")!) : undefined;
  if (at && Number.isNaN(at.getTime())) {
    return asJson ? NextResponse.json({ error: "Invalid ?at= time" }, { status: 400 }) : new NextResponse("ERROR: Invalid ?at= time", { status: 400 });
  }

  if (!point || !Number.isFinite(min) || min <= 0) {
    const error = resortId && !resort ? `Unknown resort "${resortId}"` : "Pass ?resort=<id> or ?lat=&lon=, plus ?min=<inches>";
    return asJson ? NextResponse.json({ error }, { status: 400 }) : new NextResponse(`ERROR: ${error}`, { status: 400 });
  }

  // ?test=1 always answers YES, so a Shortcut can be checked end-to-end
  // (does the alarm really turn on?) without waiting for a real storm.
  if (params.get("test") === "1") {
    return asJson
      ? NextResponse.json({ powder: true, test: true }, { headers: { "Cache-Control": "no-store" } })
      : new NextResponse("YES", { headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
  }

  try {
    const measured = await getMeasuredOvernight(point.lat, point.lon, resort?.id, at);
    const powder = measured.snowfallIn != null && measured.snowfallIn >= min;
    const headers = { "Cache-Control": "no-store" };
    if (asJson) {
      return NextResponse.json({ powder, overnightSnowfallIn: measured.snowfallIn, thresholdIn: min, resort: resort?.id ?? null, ...measured }, { headers });
    }
    return new NextResponse(powder ? "YES" : "NO", { headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return asJson ? NextResponse.json({ error: message }, { status: 502 }) : new NextResponse(`ERROR: ${message}`, { status: 502 });
  }
}

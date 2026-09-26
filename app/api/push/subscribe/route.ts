import { NextRequest, NextResponse } from "next/server";
import {
  deletePushSubscription,
  getPushSubscription,
  parsePushKeys,
  upsertPushSubscription,
} from "@/lib/db/push-subscriptions";
import { isPushConfigured } from "@/lib/push";
import { badRequest, serverError } from "@/lib/util/api";

// PERS-06: subscribe / look up / remove a device's wake-up alert for one
// location. All three take the browser's PushSubscription JSON as
// `subscription` — the endpoint is the device identity (no login needed).

async function readBody(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Create or update (e.g. new threshold). */
export async function POST(req: NextRequest) {
  if (!isPushConfigured) return NextResponse.json({ error: "Push notifications aren't configured on this server." }, { status: 503 });
  const body = await readBody(req);
  if (!body) return badRequest("Request body must be JSON");

  const keys = parsePushKeys(body.subscription);
  const { locationName, lat, lon, thresholdIn } = body;
  if (!keys) return badRequest("A valid push subscription is required");
  if (typeof locationName !== "string" || locationName.trim().length === 0) return badRequest("locationName is required");
  if (typeof lat !== "number" || typeof lon !== "number" || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return badRequest("lat/lon must be valid coordinates");
  }
  if (typeof thresholdIn !== "number" || thresholdIn <= 0 || thresholdIn > 100) {
    return badRequest("thresholdIn must be a positive number of inches (<= 100)");
  }

  try {
    const sub = await upsertPushSubscription({ keys, locationName, lat, lon, thresholdIn });
    return NextResponse.json({ subscribed: true, thresholdIn: sub.thresholdIn });
  } catch (err) {
    return serverError(err);
  }
}

/** Look up this device + location's current state (so the card can show "on at 6""). A body-carrying method rather than GET keeps the push endpoint out of URLs/logs. */
export async function PATCH(req: NextRequest) {
  const body = await readBody(req);
  const keys = parsePushKeys(body?.subscription);
  if (!keys || typeof body?.locationName !== "string") return badRequest("subscription and locationName are required");
  try {
    const sub = await getPushSubscription(keys.endpoint, body.locationName);
    return NextResponse.json({ subscribed: Boolean(sub), thresholdIn: sub?.thresholdIn ?? null });
  } catch (err) {
    return serverError(err);
  }
}

export async function DELETE(req: NextRequest) {
  const body = await readBody(req);
  const keys = parsePushKeys(body?.subscription);
  if (!keys || typeof body?.locationName !== "string") return badRequest("subscription and locationName are required");
  try {
    const removed = await deletePushSubscription(keys.endpoint, body.locationName);
    return NextResponse.json({ removed });
  } catch (err) {
    return serverError(err);
  }
}

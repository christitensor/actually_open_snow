import { NextRequest, NextResponse } from "next/server";
import { listPushSubscriptionsForEndpoint, parsePushKeys } from "@/lib/db/push-subscriptions";
import { isPushConfigured, sendPush } from "@/lib/push";
import { badRequest, serverError } from "@/lib/util/api";

// PERS-06: "send me a test" — lets someone confirm on their own phone that
// the notification actually arrives (and how loud it is) before relying
// on it at 5am. Only sends to an endpoint that has already subscribed, so
// this can't be used to push arbitrary endpoints.
export async function POST(req: NextRequest) {
  if (!isPushConfigured) return NextResponse.json({ error: "Push notifications aren't configured on this server." }, { status: 503 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("Request body must be JSON");
  }
  const keys = parsePushKeys(body.subscription);
  if (!keys) return badRequest("A valid push subscription is required");

  try {
    const subs = await listPushSubscriptionsForEndpoint(keys.endpoint);
    if (subs.length === 0) return badRequest("Turn on a wake-up alert first, then send a test.");
    const result = await sendPush(subs[0], {
      title: "❄️ Test wake-up alert",
      body: `This is what you'll get when ${subs[0].locationName} gets ${subs[0].thresholdIn}"+ overnight.`,
      url: "/",
      tag: "wake-test",
    });
    if (!result.sent) return NextResponse.json({ error: result.error }, { status: 502 });
    return NextResponse.json({ sent: true });
  } catch (err) {
    return serverError(err);
  }
}

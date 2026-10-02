import { after, NextRequest, NextResponse } from "next/server";
import { parsePushKeys } from "@/lib/db/push-subscriptions";
import { isPushConfigured, sendPush } from "@/lib/push";
import { badRequest, serverError } from "@/lib/util/api";

// The delayed test keeps running after the response (via after()), so give it headroom.
export const maxDuration = 60;

const MAX_DELAY_SECONDS = 30;

// PERS-06: "send me a test" — lets someone confirm on their own phone that
// the notification actually arrives (and how loud it is) before relying on
// it at 5am. Works before any wake-up alert is turned on: the caller hands
// over its own push subscription, and only the device holding that
// subscription's private keys can receive anything sent to it. The
// message is fixed text, so this can't be used to push arbitrary content.
//
// delaySeconds (0-30) exists so the user can lock their phone first —
// a notification that arrives while the app is open on screen doesn't
// show what a locked phone on the nightstand will do. The delayed send
// runs in after(), not inside the request: once the phone locks, iOS
// suspends the app and would drop a request still waiting on a reply.
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
  const delaySeconds = Math.min(Math.max(Math.round(Number(body.delaySeconds) || 0), 0), MAX_DELAY_SECONDS);
  const locationName = typeof body.locationName === "string" ? body.locationName.slice(0, 80) : null;

  const payload = {
    title: "❄️ Test wake-up alert",
    body: locationName
      ? `It works! This is how you'll be woken up when ${locationName} gets a big overnight dump.`
      : "It works! This is how you'll be woken up on a powder morning.",
    url: "/",
    tag: "wake-test",
  };

  if (delaySeconds > 0) {
    after(async () => {
      await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
      const result = await sendPush(keys, payload);
      if (!result.sent) console.error("Delayed test push failed:", result.error);
    });
    return NextResponse.json({ sent: false, scheduledInSeconds: delaySeconds });
  }

  try {
    const result = await sendPush(keys, payload);
    if (!result.sent) return NextResponse.json({ error: result.error }, { status: 502 });
    return NextResponse.json({ sent: true });
  } catch (err) {
    return serverError(err);
  }
}

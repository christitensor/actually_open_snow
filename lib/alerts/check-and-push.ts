// PERS-06: the early-morning "wake me up" check. For each push
// subscription, sums snowfall since 5pm local yesterday and, if it meets
// the threshold, sends a high-urgency push — at most once per subscription
// per local calendar day. Separate from PERS-03's email check because
// that one looks at *today's forecast*; this one looks at what actually
// fell overnight, which is what should get someone out of bed.

import { getOvernightSnowfallIn } from "@/lib/data-sources/open-meteo";
import { listAllPushSubscriptions, markPushNotified } from "@/lib/db/push-subscriptions";
import { sendPush, type SendPushResult } from "@/lib/push";

export interface PushCheckResult {
  subscriptionId: number;
  locationName: string;
  overnightSnowfallIn: number | null;
  thresholdIn: number;
  crossed: boolean;
  alreadyNotifiedToday: boolean;
  pushResult?: SendPushResult;
  error?: string;
}

export async function checkAndPushAll(): Promise<PushCheckResult[]> {
  const subscriptions = await listAllPushSubscriptions();
  const results: PushCheckResult[] = [];

  // Many devices usually watch the same few resorts — fetch each point once.
  const snowByPoint = new Map<string, ReturnType<typeof getOvernightSnowfallIn>>();

  for (const sub of subscriptions) {
    try {
      const pointKey = `${sub.lat.toFixed(4)},${sub.lon.toFixed(4)}`;
      if (!snowByPoint.has(pointKey)) snowByPoint.set(pointKey, getOvernightSnowfallIn(sub.lat, sub.lon));
      const { snowfallIn, localDate } = await snowByPoint.get(pointKey)!;

      const crossed = snowfallIn >= sub.thresholdIn;
      const alreadyNotifiedToday = sub.lastNotifiedDate === localDate;

      let pushResult: SendPushResult | undefined;
      if (crossed && !alreadyNotifiedToday) {
        pushResult = await sendPush(sub, {
          title: `❄️ ${snowfallIn.toFixed(1)}" overnight at ${sub.locationName}`,
          body: `Your ${sub.thresholdIn}" wake-up threshold was hit. Time to get up!`,
          url: "/",
          tag: `wake-${sub.id}`,
        });
        if (pushResult.sent) await markPushNotified(sub.id, localDate);
      }

      results.push({
        subscriptionId: sub.id,
        locationName: sub.locationName,
        overnightSnowfallIn: snowfallIn,
        thresholdIn: sub.thresholdIn,
        crossed,
        alreadyNotifiedToday,
        pushResult,
      });
    } catch (err) {
      results.push({
        subscriptionId: sub.id,
        locationName: sub.locationName,
        overnightSnowfallIn: null,
        thresholdIn: sub.thresholdIn,
        crossed: false,
        alreadyNotifiedToday: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return results;
}

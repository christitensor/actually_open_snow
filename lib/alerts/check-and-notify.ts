// PERS-03: compares each subscription's threshold against today's
// forecast and sends (or logs, see lib/email.ts) a notification when
// crossed — at most once per subscription per day.

import { getForecast } from "@/lib/data-sources/open-meteo";
import { listSubscriptions, markNotifiedToday } from "@/lib/db/sqlite";
import { sendEmail, type SendEmailResult } from "@/lib/email";

export interface AlertCheckResult {
  subscriptionId: number;
  email: string;
  locationName: string;
  todaySnowfallIn: number | null;
  thresholdIn: number;
  crossed: boolean;
  alreadyNotifiedToday: boolean;
  emailResult?: SendEmailResult;
  error?: string;
}

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

export async function checkAndNotifyAll(): Promise<AlertCheckResult[]> {
  const subscriptions = listSubscriptions();
  const todayStr = new Date().toISOString().slice(0, 10);
  const results: AlertCheckResult[] = [];

  for (const sub of subscriptions) {
    try {
      const forecast = await getForecast(sub.lat, sub.lon);
      const todaySnowfallIn = forecast.daily[0]?.snowfallSumIn ?? 0;
      const crossed = todaySnowfallIn >= sub.thresholdIn;
      const alreadyNotifiedToday = sub.lastNotifiedDate === todayStr;

      let emailResult: SendEmailResult | undefined;
      if (crossed && !alreadyNotifiedToday) {
        emailResult = await sendEmail({
          to: sub.email,
          subject: `${todaySnowfallIn.toFixed(1)}" forecast today at ${sub.locationName}`,
          text:
            `Your alert threshold of ${sub.thresholdIn}" has been crossed: ${todaySnowfallIn.toFixed(1)}" of new ` +
            `snow is forecast today at ${sub.locationName}.\n\n` +
            `Unsubscribe: ${APP_URL}/api/alerts/unsubscribe?token=${sub.unsubscribeToken}`,
        });
        markNotifiedToday(sub.id, todayStr);
      }

      results.push({
        subscriptionId: sub.id,
        email: sub.email,
        locationName: sub.locationName,
        todaySnowfallIn,
        thresholdIn: sub.thresholdIn,
        crossed,
        alreadyNotifiedToday,
        emailResult,
      });
    } catch (err) {
      results.push({
        subscriptionId: sub.id,
        email: sub.email,
        locationName: sub.locationName,
        todaySnowfallIn: null,
        thresholdIn: sub.thresholdIn,
        crossed: false,
        alreadyNotifiedToday: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return results;
}

import { NextRequest, NextResponse } from "next/server";
import { createSubscription } from "@/lib/db/sqlite";
import { badRequest, serverError } from "@/lib/util/api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// PERS-03: subscribe an email to snow-forecast threshold alerts for a
// location. No account/login — this is a mailing-list-style subscription,
// matching the matrix's original design intent for this feature.
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Request body must be JSON");
  }

  const { email, locationName, lat, lon, thresholdIn } = body as Record<string, unknown>;

  if (typeof email !== "string" || !EMAIL_RE.test(email)) return badRequest("A valid email is required");
  if (typeof locationName !== "string" || locationName.trim().length === 0) return badRequest("locationName is required");
  if (typeof lat !== "number" || typeof lon !== "number" || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return badRequest("lat/lon must be valid coordinates");
  }
  if (typeof thresholdIn !== "number" || thresholdIn <= 0 || thresholdIn > 100) {
    return badRequest("thresholdIn must be a positive number of inches (<= 100)");
  }

  try {
    const subscription = createSubscription({ email, locationName, lat, lon, thresholdIn });
    return NextResponse.json({
      id: subscription.id,
      unsubscribeToken: subscription.unsubscribeToken,
      message: `Subscribed ${email} to alerts for ${locationName} at ${thresholdIn}"+ new snow.`,
    });
  } catch (err) {
    return serverError(err);
  }
}

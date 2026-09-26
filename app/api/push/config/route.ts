import { NextResponse } from "next/server";
import { isPostgresConfigured } from "@/lib/db/postgres";
import { isPushConfigured, vapidPublicKey } from "@/lib/push";

// PERS-06: the client needs the VAPID public key to subscribe. Served at
// runtime (not NEXT_PUBLIC_*) so setting the env var only needs a
// redeploy, not a rebuild with the key baked into the bundle.
export async function GET() {
  const enabled = isPushConfigured && isPostgresConfigured;
  return NextResponse.json({ enabled, vapidPublicKey: enabled ? vapidPublicKey : null });
}

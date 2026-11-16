import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, revokeOtherSessions, revokeSession } from "@/lib/auth/sessions";

// Sign out one device ({ revoke: "<sessionId>" }) or every device but this one ({ revoke: "others" }).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { revoke } = (await req.json().catch(() => ({}))) as { revoke?: string };
  if (!revoke) return NextResponse.json({ error: "revoke is required" }, { status: 400 });
  if (revoke === "others") return NextResponse.json({ revoked: await revokeOtherSessions(user.id, user.sessionId) });
  await revokeSession(user.id, revoke);
  return NextResponse.json({ revoked: 1 });
}

import { NextResponse } from "next/server";
import { getCurrentUser, listSessions } from "@/lib/auth/sessions";
import { listPasskeys } from "@/lib/auth/passkeys";

// Everything the account page shows: sign-in methods (passkeys + email) and signed-in devices.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const [passkeys, sessions] = await Promise.all([listPasskeys(user.id), listSessions(user.id, user.sessionId)]);
  return NextResponse.json({ email: user.email, passkeys, sessions });
}

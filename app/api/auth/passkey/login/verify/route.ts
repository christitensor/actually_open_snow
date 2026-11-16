import { NextRequest, NextResponse } from "next/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { clearChallenge, readChallenge, verifyAuthentication } from "@/lib/auth/passkeys";
import { createSession, setSessionCookie } from "@/lib/auth/sessions";
import { getUserById } from "@/lib/db/users";

// Step 2 of signing in with a passkey: verify the assertion, start a session.
export async function POST(req: NextRequest) {
  const challenge = readChallenge(req, "login");
  if (!challenge) return NextResponse.json({ error: "That took too long — try again." }, { status: 400 });

  let response: AuthenticationResponseJSON;
  try {
    ({ response } = (await req.json()) as { response: AuthenticationResponseJSON });
  } catch {
    return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
  }

  try {
    const userId = await verifyAuthentication(req, challenge.challenge, response);
    const user = userId != null ? await getUserById(userId) : null;
    if (!user) {
      const res = NextResponse.json(
        { error: "That passkey isn't registered here (it may have been removed). Sign in with an email code instead." },
        { status: 400 }
      );
      clearChallenge(res);
      return res;
    }
    const session = await createSession(user.id, req.headers.get("user-agent"));
    const res = NextResponse.json({ email: user.email });
    setSessionCookie(res, session.token, session.expiresAt);
    clearChallenge(res);
    return res;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Passkey sign-in failed." }, { status: 400 });
  }
}

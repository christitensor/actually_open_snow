import { NextRequest, NextResponse } from "next/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { getCurrentUser, describeUserAgent } from "@/lib/auth/sessions";
import { clearChallenge, readChallenge, verifyRegistration } from "@/lib/auth/passkeys";

// Step 2 of adding a passkey: verify the authenticator's response and store the credential.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const challenge = readChallenge(req, "register");
  if (!challenge || challenge.userId !== user.id) return NextResponse.json({ error: "That took too long — try again." }, { status: 400 });

  let body: { response?: RegistrationResponseJSON; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
  }
  if (!body.response) return NextResponse.json({ error: "Missing passkey response" }, { status: 400 });

  try {
    const name = body.name?.trim() || describeUserAgent(req.headers.get("user-agent")).replace(/^.* on /, "");
    const passkey = await verifyRegistration(req, user.id, challenge.challenge, body.response, name);
    const res = passkey ? NextResponse.json({ passkey }) : NextResponse.json({ error: "Couldn't verify that passkey." }, { status: 400 });
    clearChallenge(res);
    return res;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't verify that passkey." }, { status: 400 });
  }
}

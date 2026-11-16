import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/sessions";
import { registrationOptions, setChallenge } from "@/lib/auth/passkeys";

// Step 1 of adding a passkey to the signed-in account.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const options = await registrationOptions(req, user);
  const res = NextResponse.json(options);
  setChallenge(res, options.challenge, "register", user.id);
  return res;
}

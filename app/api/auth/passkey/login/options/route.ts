import { NextRequest, NextResponse } from "next/server";
import { authenticationOptions, setChallenge } from "@/lib/auth/passkeys";

// Step 1 of signing in with a passkey.
export async function POST(req: NextRequest) {
  const options = await authenticationOptions(req);
  const res = NextResponse.json(options);
  setChallenge(res, options.challenge, "login");
  return res;
}

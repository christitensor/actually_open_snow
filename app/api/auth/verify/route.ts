import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUser } from "@/lib/db/users";
import { consumeMagicLinkToken } from "@/lib/auth/magic-link";
import { createSession, setSessionCookie } from "@/lib/auth/sessions";
import { safeNextPath } from "@/lib/util/api";

// PERS-04: the link in the sign-in email (the 6-digit code is the primary
// path; see /api/auth/verify-code). Signs in whichever browser opens it and
// redirects back. `signedIn=1` tells the client to import local favorites
// and offer to add a passkey.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const nextPath = safeNextPath(req.nextUrl.searchParams.get("next"));

  const failed = () => {
    const url = new URL("/", req.url);
    url.searchParams.set("signInError", "1");
    return NextResponse.redirect(url);
  };

  let user: Awaited<ReturnType<typeof getOrCreateUser>>;
  let session: Awaited<ReturnType<typeof createSession>>;
  try {
    const email = token ? consumeMagicLinkToken(token) : null;
    if (!email) return failed();
    user = await getOrCreateUser(email);
    session = await createSession(user.id, req.headers.get("user-agent"));
  } catch (err) {
    // e.g. SESSION_SECRET unset in production, or the database unreachable.
    console.error("Magic-link sign-in failed:", err);
    return failed();
  }

  const url = new URL(nextPath, req.url);
  url.searchParams.set("signedIn", "1");
  if (user.created) url.searchParams.set("accountCreated", "1");
  const response = NextResponse.redirect(url);
  setSessionCookie(response, session.token, session.expiresAt);
  return response;
}

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/sessions";
import { getPreferences, replacePreferences, updatePreferences } from "@/lib/db/preferences";
import type { Preferences } from "@/lib/preferences/schema";

// PERS-08: the signed-in account's view settings.
// GET → { prefs } (null if never saved). PATCH { ...partial } → merged result. PUT { ...all } → replaced.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  return NextResponse.json({ prefs: await getPreferences(user.id) }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  let patch: Partial<Preferences>;
  try {
    patch = (await req.json()) as Partial<Preferences>;
  } catch {
    return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
  }
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return NextResponse.json({ error: "Expected an object" }, { status: 400 });
  return NextResponse.json({ prefs: await updatePreferences(user.id, patch) });
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Expected an object" }, { status: 400 });
  return NextResponse.json({ prefs: await replacePreferences(user.id, body) });
}

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/sessions";
import { deletePasskey, renamePasskey } from "@/lib/auth/passkeys";

// Remove a passkey from the signed-in account. (The copy in the device's
// password manager stays until the person deletes it there; it just stops working here.)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await params;
  const ok = await deletePasskey(user.id, id);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await params;
  const { name } = (await req.json().catch(() => ({}))) as { name?: string };
  if (!name?.trim()) return NextResponse.json({ error: "Name required" }, { status: 400 });
  await renamePasskey(user.id, id, name.trim());
  return NextResponse.json({ ok: true });
}

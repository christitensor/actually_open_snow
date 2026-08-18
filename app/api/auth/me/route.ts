import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUserBySessionToken } from "@/lib/db/users";
import { SESSION_COOKIE } from "@/lib/auth/cookie";

// PERS-04: whether the current browser has a valid session — polled once
// by lib/auth.tsx on mount to decide whether favorites should read/write
// localStorage or the server.
export async function GET() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = token ? getUserBySessionToken(token) : null;
  return NextResponse.json({ email: user?.email ?? null });
}

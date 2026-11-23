import { NextResponse } from "next/server";

export function parseLatLon(searchParams: URLSearchParams): { lat: number; lon: number } | null {
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function serverError(err: unknown) {
  const message = err instanceof Error ? err.message : "Unknown error";
  return NextResponse.json({ error: message }, { status: 502 });
}

/**
 * A same-origin path to send the user to after sign-in, or "/" if `next`
 * isn't one. A plain startsWith("/") check isn't enough: "//evil.com",
 * "/\evil.com" and "/\t/evil.com" all start with "/" yet resolve to another
 * host, turning the sign-in redirect into an open redirect.
 */
export function safeNextPath(next: unknown): string {
  if (typeof next !== "string" || !next.startsWith("/")) return "/";
  try {
    const base = "http://same-origin.invalid";
    const url = new URL(next, base);
    if (url.origin !== base) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

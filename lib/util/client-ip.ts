import type { NextRequest } from "next/server";

/**
 * Best-effort client IP for rate limiting. On Vercel these headers are set
 * by the platform's edge (any client-supplied value is overwritten), so
 * they're trustworthy there; behind another proxy, make sure it does the
 * same. Falls back to a shared "unknown" bucket rather than skipping limits.
 */
export function clientIp(req: NextRequest): string {
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}

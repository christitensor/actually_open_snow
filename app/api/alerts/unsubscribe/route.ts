import { NextRequest } from "next/server";
import { deleteSubscriptionByToken } from "@/lib/db/sqlite";

// PERS-03: unsubscribe link target — designed to be clicked from an email,
// so it returns a small HTML confirmation page rather than JSON.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const removed = token ? deleteSubscriptionByToken(token) : false;

  const message = removed
    ? "You've been unsubscribed from this alert."
    : "That unsubscribe link is invalid or already used.";

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Unsubscribe</title>
<style>body{font-family:system-ui,sans-serif;max-width:28rem;margin:4rem auto;padding:0 1rem;text-align:center;color:#111}</style>
</head><body><p>${message}</p><p><a href="/">Back to Actually Open Snow</a></p></body></html>`;

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

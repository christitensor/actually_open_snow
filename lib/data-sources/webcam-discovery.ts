// Auto-discovers live webcams for a ski area that isn't hand-curated in
// data/webcams.json, by reading the resort's own website — the same
// manual process documented in data/webcams.ts, automated:
//
// 1. Find the resort's webcam page: links on the homepage whose URL or
//    text says "webcam"/"cams", then its sitemap.xml, then a few common
//    paths (/webcams, /mountain-cams, …).
// 2. Pull every camera out of that page's raw HTML (no headless browser —
//    as data/webcams.ts found for Alta and Powder Mountain, the data is
//    usually already sitting in the server-rendered HTML or a JSON blob):
//    - HD Relay widgets (`HDRelay.create({ id })`) → resolved to a JPEG
//      snapshot via HD Relay's public player JSON (Snowbasin's scheme)
//    - live-video iframes from known webcam vendors (YouTube, HD Relay,
//      CamStreamer, Brown Rice, Roundshot, Panomax, ipcamlive, …)
//    - JPEG URLs that look like cams, kept only when the image is
//      actually fresh (Last-Modified within 3 days) so marketing photos
//      with "cam" in the path don't sneak in
//
// Best effort by design: some resort sites sit behind bot walls (Vail
// Resorts' Akamai, Alterra's Cloudflare challenge) and return nothing
// useful to a server-side fetch. Callers always get `pageUrl` (when found)
// so the UI can at least link out.

import type { Webcam } from "@/lib/models/types";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const FETCH_TIMEOUT_MS = 8000;
const REVALIDATE_S = 6 * 3600; // resort webcam pages change rarely
const MAX_CAMS = 16;
const FRESH_MS = 3 * 86400000;

export interface DiscoveredWebcams {
  /** The resort page the cams were read from — or best guess at it — for a "see all" link-out. */
  pageUrl: string | null;
  webcams: Webcam[];
}

interface Page {
  url: string;
  html: string;
}

async function fetchPage(url: string): Promise<Page | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      next: { revalidate: REVALIDATE_S },
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!/html|xml|text/i.test(type)) return null;
    const html = await res.text();
    // Bot-wall interstitials (Cloudflare/Akamai challenges) come back 200
    // with a tiny JS stub — treat them as a miss, not a real page.
    if (html.length < 2000) return null;
    return { url: res.url || url, html };
  } catch {
    return null;
  }
}

const CAM_WORD = /web[\s_-]?cams?|mountain[\s_-]?cams?|live[\s_-]?cams?|snow[\s_-]?cams?|\/cams?(?:\/|$|\?)/i;

function sameSite(a: string, b: string): boolean {
  try {
    const ha = new URL(a).hostname.replace(/^www\./, "");
    const hb = new URL(b).hostname.replace(/^www\./, "");
    return ha === hb || ha.endsWith(`.${hb}`) || hb.endsWith(`.${ha}`);
  } catch {
    return false;
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/** Ranks candidate URLs so "/webcams" beats "/blog/webcam-tour-2019". */
function scoreCamUrl(u: string): number {
  const path = (() => {
    try {
      return new URL(u).pathname.toLowerCase();
    } catch {
      return u.toLowerCase();
    }
  })();
  let s = 0;
  if (/web-?cams?\/?$|mountain-?cams\/?$|live-?(?:mountain-?)?cams\/?$|\/cams\/?$/.test(path)) s += 10;
  if (/blog|news|story|stories|article|press|login|camp|event/.test(path)) s -= 20;
  s -= path.split("/").filter(Boolean).length; // shallower is likelier the index page
  return s;
}

function findCamLinks(page: Page): string[] {
  const out = new Set<string>();
  for (const m of page.html.matchAll(/<a\b[^>]*?href=["']([^"'#]+)["'][^>]*>([\s\S]{0,300}?)<\/a>/gi)) {
    const href = m[1];
    const text = stripTags(m[2]);
    if (!CAM_WORD.test(href) && !/\b(web ?cams?|mountain cams|live cams)\b/i.test(text)) continue;
    try {
      const abs = new URL(href, page.url).href;
      if (sameSite(abs, page.url)) out.add(abs.replace(/\/$/, ""));
    } catch {
      /* ignore malformed hrefs */
    }
  }
  return [...out];
}

async function findCamLinksInSitemap(origin: string): Promise<string[]> {
  const root = await fetchPage(new URL("/sitemap.xml", origin).href);
  if (!root) return [];
  const locs = (html: string) => [...html.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
  let all = locs(root.html);
  // A sitemap index points at child sitemaps — follow the page-ish ones.
  const children = all.filter((l) => /\.xml(\.gz)?$/i.test(l) && !/image|video|product|post_tag|author/i.test(l)).slice(0, 6);
  if (children.length) {
    const subs = await Promise.all(children.map((c) => fetchPage(c)));
    all = all.concat(...subs.map((s) => (s ? locs(s.html) : [])));
  }
  return all.filter((l) => CAM_WORD.test(l) && !/\.xml/i.test(l));
}

const GUESS_PATHS = ["/webcams", "/mountain-cams", "/web-cams", "/cams", "/the-mountain/webcams", "/mountain/webcams", "/conditions/webcams", "/webcam"];

// ---------------------------------------------------------------------------
// Extraction

interface RawCam {
  name: string | null;
  imageUrl?: string;
  videoEmbedUrl?: string;
  /** Needs a freshness check before it can be trusted as a live cam */
  needsFreshCheck?: boolean;
}

/** Nearest heading / title / alt text before `index` — the cam's label on most webcam pages. */
function labelNear(html: string, index: number, own?: string | null): string | null {
  if (own && own.trim().length > 1 && !/^(iframe|video|player|webcam|image|youtube video player)$/i.test(own.trim())) return stripTags(own).slice(0, 80);
  const before = html.slice(Math.max(0, index - 2500), index);
  const usable = (h: string) => h.length > 1 && h.length < 70 && !/:$/.test(h) && !/cookie|subscribe|menu|sign in|newsletter/i.test(h);
  // A real heading wins over nearby detail text ("Elevation: 8,900'").
  const headings = [...before.matchAll(/<(h[1-6])\b[^>]*>([\s\S]{1,200}?)<\/\1>/gi)].map((m) => stripTags(m[2]));
  const heading = headings.reverse().find(usable);
  if (heading) return heading;
  const other = [...before.matchAll(/<(figcaption|strong|p)\b[^>]*>([\s\S]{1,160}?)<\/\1>/gi)].map((m) => stripTags(m[2]));
  return other.reverse().find(usable) ?? null;
}

const VIDEO_IFRAME = [
  /youtube(?:-nocookie)?\.com\/embed\//i,
  /watch\.hdrelay\.io\/player/i,
  /hdrelay\.com\/(?:player|embed)/i,
  /camstreamer\.com\/embed/i,
  /player\.brownrice\.com\/embed/i,
  /\.roundshot\.com/i,
  /panomax\.com/i,
  /ipcamlive\.com\/player/i,
  /rtsp\.me\/embed/i,
  /angelcam\.com/i,
  /earthcam\.(?:com|net)/i,
  /skaping\.com/i,
  /webcams\.travel|windy\.com\/webcams/i,
  /player\.vimeo\.com\/video\/\d+.*live|vimeo\.com\/event/i,
  /iseecam|ozolio\.com|relay\.ozolio/i,
];

function extractCams(page: Page): RawCam[] {
  // JSON blobs (Next.js RSC payloads, CMS data) escape slashes.
  const html = page.html.replace(/\\\//g, "/").replace(/\\u0026/g, "&");
  const cams: RawCam[] = [];
  const seen = new Set<string>();
  const push = (key: string, cam: RawCam) => {
    if (seen.has(key)) return;
    seen.add(key);
    cams.push(cam);
  };

  // Live-video iframes from webcam vendors.
  for (const m of html.matchAll(/<iframe\b([^>]*)>/gi)) {
    const attrs = m[1];
    const src = attrs.match(/\s(?:data-)?src=["']([^"']+)["']/i)?.[1];
    if (!src || !VIDEO_IFRAME.some((re) => re.test(src))) continue;
    let abs: string;
    try {
      abs = new URL(decodeEntities(src.trim()), page.url).href;
    } catch {
      continue;
    }
    const title = attrs.match(/\stitle=["']([^"']+)["']/i)?.[1];
    const yt = /youtube(?:-nocookie)?\.com\/embed\//i.test(abs) ? abs.match(/embed\/([\w-]{11})/) : null;
    push(yt ? `yt:${yt[1]}` : abs, {
      name: labelNear(html, m.index ?? 0, title),
      videoEmbedUrl: yt ? `https://www.youtube.com/embed/${yt[1]}?autoplay=1&mute=1` : abs,
    });
  }

  // YouTube embeds referenced outside an <iframe> tag (lazy-loaded players, JSON).
  for (const m of html.matchAll(/youtube(?:-nocookie)?\.com\/embed\/([\w-]{11})/g)) {
    push(`yt:${m[1]}`, { name: labelNear(html, m.index ?? 0), videoEmbedUrl: `https://www.youtube.com/embed/${m[1]}?autoplay=1&mute=1` });
  }

  // HD Relay widgets — resolved to snapshots in resolveHdRelay().
  for (const m of html.matchAll(/HDRelay\.create\(\s*\{[^}]*?\bid\s*:\s*["']([\w-]+)["']/g)) {
    push(`hdr:${m[1]}`, { name: labelNear(html, m.index ?? 0), imageUrl: `hdrelay:${m[1]}` });
  }

  // Roundshot 360° panoramas: the /cams/{id}/{size} endpoint redirects to
  // the latest capture (Jackson Hole's scheme).
  for (const m of html.matchAll(/backend\.roundshot\.com\/cams\/([a-f0-9]{16,})\//gi)) {
    push(`rs:${m[1]}`, { name: "360° panorama", imageUrl: `https://backend.roundshot.com/cams/${m[1]}/quarter` });
  }

  // Direct still images that look like webcams — absolute URLs anywhere
  // in the page (incl. JSON), plus relative <img src>s (Timberline's
  // "/snowcameras/lodge.jpg").
  const imageMatches = [
    ...[...html.matchAll(/(?:https?:)?\/\/[^"'\s()<>\\]+?\.(?:jpe?g)(?:\?[^"'\s()<>\\]*)?/gi)].map((m) => ({ raw: m[0], index: m.index ?? 0 })),
    ...[...html.matchAll(/<img\b[^>]*?\s(?:data-)?src=["'](\/?(?!\/)[^"':]+?\.jpe?g(?:\?[^"']*)?)["']/gi)].map((m) => ({ raw: m[1], index: m.index ?? 0 })),
  ];
  for (const m of imageMatches) {
    let url: string;
    try {
      url = new URL(decodeEntities(m.raw.startsWith("//") ? `https:${m.raw}` : m.raw), page.url).href;
    } catch {
      continue;
    }
    if (!/cam|snapshot|get_image|live/i.test(url) || /camp|camera-?icon|logo|thumb|placeholder|poster|campaign|cameron|roundshot/i.test(url)) continue;
    const alt = html.slice(m.index, m.index + 400).match(/\salt=["']([^"']+)["']/i)?.[1];
    push(`img:${url.split("?")[0]}`, { name: labelNear(html, m.index, alt), imageUrl: url, needsFreshCheck: true });
  }
  // Snapshot endpoints that aren't .jpg URLs (PrismCam previews, HD Relay snapshots).
  for (const m of html.matchAll(/https?:\/\/[^"'\s()<>\\]*(?:realtime_preview\.php\?[^"'\s()<>\\]+|hdrelay\.com\/camera\/[\w]+\/(?:snapshot|get_image))/gi)) {
    const url = m[0].replace(/&amp;/g, "&");
    push(`img:${url}`, { name: labelNear(html, m.index ?? 0), imageUrl: url });
  }

  return cams;
}

async function resolveHdRelay(embedId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://manage.hdrelay.com/player/${encodeURIComponent(embedId)}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { server?: { jpg?: string }; camera?: { id?: string } };
    if (!body.server?.jpg || !body.camera?.id) return null;
    return `https:${body.server.jpg.replace(/^https?:/, "")}/camera/${body.camera.id}/get_image`;
  } catch {
    return null;
  }
}

/** A real webcam image was updated recently; a marketing photo wasn't. */
async function isFreshImage(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!res.ok || !/image/i.test(res.headers.get("content-type") ?? "")) return false;
    const lm = res.headers.get("last-modified");
    if (!lm) return /no-cache|no-store|max-age=(?:\d{1,3})\b/i.test(res.headers.get("cache-control") ?? "");
    return Date.now() - new Date(lm).getTime() < FRESH_MS;
  } catch {
    return false;
  }
}

async function finalizeCams(raw: RawCam[], meta: { resortId: string; resortName: string; lat: number; lon: number; pageUrl: string }): Promise<Webcam[]> {
  const resolved = await Promise.all(
    raw.slice(0, MAX_CAMS * 2).map(async (c) => {
      if (c.imageUrl?.startsWith("hdrelay:")) {
        const url = await resolveHdRelay(c.imageUrl.slice("hdrelay:".length));
        return url ? { ...c, imageUrl: url, needsFreshCheck: false } : null;
      }
      if (c.needsFreshCheck && c.imageUrl && !(await isFreshImage(c.imageUrl))) return null;
      return c;
    })
  );
  const kept = resolved.filter((c): c is RawCam => c != null).slice(0, MAX_CAMS);

  // Generic or duplicate labels get numbered so cards stay distinguishable.
  const counts = new Map<string, number>();
  return kept.map((c, i) => {
    let name = c.name && c.name.length > 1 ? c.name : `Cam ${i + 1}`;
    const n = (counts.get(name) ?? 0) + 1;
    counts.set(name, n);
    if (n > 1) name = `${name} ${n}`;
    return {
      id: `${meta.resortId}-auto-${i}`,
      name: `${meta.resortName} — ${name}`,
      resortId: meta.resortId,
      lat: meta.lat,
      lon: meta.lon,
      ...(c.videoEmbedUrl ? { videoEmbedUrl: c.videoEmbedUrl } : { imageUrl: c.imageUrl }),
      pageUrl: meta.pageUrl,
      source: "resort" as const,
    };
  });
}

export async function discoverWebcams(resort: { id: string; name: string; lat: number; lon: number; website?: string }): Promise<DiscoveredWebcams> {
  if (!resort.website) return { pageUrl: null, webcams: [] };
  let origin: string;
  try {
    origin = new URL(resort.website).origin;
  } catch {
    return { pageUrl: null, webcams: [] };
  }

  const home = await fetchPage(resort.website);
  const candidates = new Set<string>();
  if (home) findCamLinks(home).forEach((u) => candidates.add(u));
  if (candidates.size === 0) (await findCamLinksInSitemap(origin)).forEach((u) => candidates.add(u));
  const ranked = [...candidates].sort((a, b) => scoreCamUrl(b) - scoreCamUrl(a)).slice(0, 3);

  const tryPages = async (urls: string[]) => {
    for (const url of urls) {
      const page = await fetchPage(url);
      if (!page) continue;
      const raw = extractCams(page);
      if (raw.length === 0) continue;
      const webcams = await finalizeCams(raw, { resortId: resort.id, resortName: resort.name, lat: resort.lat, lon: resort.lon, pageUrl: page.url });
      if (webcams.length > 0) return { pageUrl: page.url, webcams };
    }
    return null;
  };

  let found = await tryPages(ranked);
  if (!found && ranked.length === 0) {
    // Probe the common paths in parallel (sequentially, a slow site's
    // timeouts stacked up past a minute), then read whichever exist.
    const probed = await Promise.all(GUESS_PATHS.map((p) => fetchPage(new URL(p, origin).href)));
    const hits = [...new Set(probed.filter((p): p is Page => p != null && CAM_WORD.test(p.url)).map((p) => p.url))];
    found = await tryPages(hits.slice(0, 2));
  }
  if (found) return found;

  // Some small hills put their one cam right on the homepage.
  if (home) {
    const raw = extractCams(home).filter((c) => !c.videoEmbedUrl || /cam|live/i.test(c.name ?? ""));
    const webcams = raw.length ? await finalizeCams(raw, { resortId: resort.id, resortName: resort.name, lat: resort.lat, lon: resort.lon, pageUrl: home.url }) : [];
    if (webcams.length) return { pageUrl: ranked[0] ?? home.url, webcams };
  }
  return { pageUrl: ranked[0] ?? null, webcams: [] };
}

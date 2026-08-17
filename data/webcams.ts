import type { Webcam } from "@/lib/models/types";
import rawWebcams from "./webcams.json";

/**
 * MAP-16 seed data. These are the resorts'/UDOT's general public webcam
 * *page* URLs, not verified direct-hotlink image URLs — none of these
 * have been confirmed live in this build session. Before shipping the
 * actual map image previews, verify each site's terms of use and find a
 * real embeddable/hotlinkable image endpoint (or embed via <iframe> where
 * the site allows it) rather than assuming the page URL doubles as one.
 * UDOT's real camera images come from its API (see TRACE_MATRIX.md
 * MAP-16) once a developer key is set up — the two UDOT entries here are
 * placeholders pointing at the general camera page until that's wired up.
 */
export const webcams: Webcam[] = rawWebcams as Webcam[];

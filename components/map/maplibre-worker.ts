import { getVersion, setWorkerUrl } from "maplibre-gl";

// Point MapLibre at its worker, copied into public/ by
// scripts/copy-maplibre-worker.mjs (see there for why). Must run before
// the first Map is created; importing this module for its side effect does
// that. The version in the path busts caches on MapLibre upgrades.
if (typeof window !== "undefined") {
  setWorkerUrl(`/maplibre/${getVersion()}/maplibre-gl-worker.mjs`);
}

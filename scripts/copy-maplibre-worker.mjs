// Copies MapLibre's web-worker files into public/ so the browser can load
// them. MapLibre 6 finds its worker relative to its own module URL
// (import.meta.url), which no longer points at node_modules once Next.js
// bundles it. The worker then starts from the page URL and dies at once,
// so nothing that needs the worker renders: vector tiles, terrain
// (raster-dem) and GeoJSON layers. components/map/maplibre-worker.ts
// calls setWorkerUrl() with this path.
//
// Runs on predev/prebuild, so the files always match the installed
// MapLibre version. Output is gitignored.
import { copyFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgDir = join(root, "node_modules", "maplibre-gl");
const { version } = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
const outRoot = join(root, "public", "maplibre");
const out = join(outRoot, version);

rmSync(outRoot, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(join(pkgDir, "dist", f), join(out, f));
}
console.log(`maplibre worker ${version} -> public/maplibre/${version}/`);

/**
 * Clip a high-resolution coastline to the Salish Sea and write GeoJSON.
 *
 * Source: OSM land polygons (https://osmdata.openstreetmap.de/data/land-polygons.html),
 * ODbL, metre-resolution. Natural Earth 1:10m was measured and rejected: it
 * classifies the Anacortes inland point as water and Friday Harbor as land.
 *
 * Usage:
 *   1. download and unzip land-polygons-split-4326 from the URL above
 *   2. node scripts/build-coastline.mjs <path-to-shapefile-dir> data/coastline.geojson
 *
 * Requires `ogr2ogr` (GDAL) on PATH: brew install gdal
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadRegistry } from "../src/registry.js";

const [, , sourceDir, output] = process.argv;
if (!sourceDir || !output) {
  console.error("usage: build-coastline.mjs <shapefile-dir> <output.geojson>");
  process.exit(1);
}

/**
 * The proven Salish Sea clip — Juan de Fuca through the Strait of Georgia.
 * `[minLon, minLat, maxLon, maxLat]`. This is a *floor*: the clip only ever
 * grows outward from it, never in. The NOAA stations consumers audit (Olympia
 * at 47.05°N down to the Strait) live inside it but are not in this repo's
 * data, so deriving the clip purely from the registry would silently shrink
 * the south and break their audit. The registry can only push the boundary
 * further out.
 */
const SALISH_SEA_FLOOR = [-125.5, 47.0, -122.0, 50.5];

/**
 * A margin around the outermost registry station, in degrees (~28 km here).
 * The on-land audit's nearest-water ring search reaches 20 km, so an edge
 * station that lands on a shore still has coastline around it to snap to.
 * ponytail: 0.25° is the knob — raise it if a northern gate ever wants a
 * suggestion the clip can't reach, lower it to trim bundle size.
 */
const REGISTRY_MARGIN_DEG = 0.25;

/**
 * Clip bbox = the Salish Sea floor, grown to enclose every registry position
 * plus a margin. Derived from the data so it cannot fall behind the registry
 * as it grows north — the drift issue #9 was about. Registry stations are the
 * only positions this repo owns that can sit outside the floor.
 */
function clipBbox() {
  const registry = loadRegistry(
    readFileSync(fileURLToPath(new URL("../data/registry.yaml", import.meta.url)), "utf8"),
  );
  let [minLon, minLat, maxLon, maxLat] = SALISH_SEA_FLOOR;
  for (const [, record] of registry) {
    if (!Array.isArray(record.position) || record.position.length !== 2) continue;
    const [lat, lon] = record.position;
    if (typeof lat !== "number" || typeof lon !== "number") continue;
    minLon = Math.min(minLon, lon - REGISTRY_MARGIN_DEG);
    maxLon = Math.max(maxLon, lon + REGISTRY_MARGIN_DEG);
    minLat = Math.min(minLat, lat - REGISTRY_MARGIN_DEG);
    maxLat = Math.max(maxLat, lat + REGISTRY_MARGIN_DEG);
  }
  return [minLon, minLat, maxLon, maxLat];
}

const BBOX = clipBbox();
console.log(`clip bbox (registry-derived): ${BBOX.map((n) => n.toFixed(4)).join(", ")}`);

execFileSync(
  "ogr2ogr",
  [
    "-f", "GeoJSON",
    "-clipsrc", ...BBOX.map(String),
    // Simplify to ~10 m. Enough to keep every island and inlet that matters,
    // small enough to ship. Do not raise this without re-running the golden points.
    "-simplify", "0.0001",
    output,
    sourceDir,
  ],
  { stdio: "inherit" },
);

console.log(`wrote ${output}`);

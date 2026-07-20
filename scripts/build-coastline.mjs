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

const [, , sourceDir, output] = process.argv;
if (!sourceDir || !output) {
  console.error("usage: build-coastline.mjs <shapefile-dir> <output.geojson>");
  process.exit(1);
}

/** [minLon, minLat, maxLon, maxLat] — Juan de Fuca through the Strait of Georgia. */
const BBOX = [-125.5, 47.0, -122.0, 50.5];

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

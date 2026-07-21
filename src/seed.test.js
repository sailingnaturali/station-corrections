import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createResolver } from "./resolve.js";
import { loadCorrections } from "./corrections.js";

const read = (name) =>
  readFileSync(fileURLToPath(new URL(`../data/${name}`, import.meta.url)), "utf8");

const corrections = loadCorrections(read("corrections.yaml"));
const gazetteer = JSON.parse(read("gazetteer.json"));
const resolve = createResolver({ corrections, gazetteer });

// All 18 stations that arrive with no context of their own. IDs and coordinates
// were derived from slackwater-web's bundled station data, not written by hand -
// three hand-written IDs in an earlier draft pointed at the wrong stations.
const CONTEXTLESS = [
  ["noaa/9445133", "Bangor Wharf", 47.748, -122.727],
  ["noaa/9449424", "CHERRY POINT", 48.863, -122.759],
  ["noaa/9447659", "Everett", 47.980, -122.223],
  ["noaa/9445016", "Foulweather Bluff", 47.927, -122.617],
  ["noaa/9443551", "Jim Creek", 48.187, -124.063],
  ["noaa/9447973", "NAS Whidbey Island", 48.343, -122.686],
  ["noaa/9443090", "NEAH BAY", 48.371, -124.602],
  ["noaa/9449639", "POINT ROBERTS, PUGET SOUND", 48.975, -123.083],
  ["noaa/9444090", "Port Angeles", 48.125, -123.440],
  ["noaa/9444900", "PORT TOWNSEND", 48.111, -122.760],
  ["noaa/9447717", "Priest Point", 48.035, -122.227],
  ["noaa/9446804", "SANDY POINT ANDERSON ISLAND, PUGET SOUND", 47.153, -122.675],
  ["noaa/9448576", "Sneeoosh Point", 48.400, -122.548],
  ["noaa/9448009", "Spee-Bi-Dah", 48.088, -122.322],
  ["noaa/9449988", "TELEGRAPH BAY, PUGET SOUND", 48.443, -122.805],
  ["noaa/9447773", "Tulalip", 48.065, -122.288],
  ["noaa/9445478", "Union", 47.358, -123.098],
  ["noaa/9449746", "WALDRON ISLAND, PUGET SOUND", 48.687, -123.038],
];

for (const [id, raw, lat, lon] of CONTEXTLESS) {
  test(`${raw} resolves with a context`, () => {
    const r = resolve({ id, name: raw, latitude: lat, longitude: lon });
    assert.notEqual(r.context, "", `${raw} still has no context`);
    assert.notEqual(r.context.toLowerCase(), r.name.toLowerCase());
  });
}

test("no name is left shouting", () => {
  for (const [id, raw, lat, lon] of CONTEXTLESS) {
    const { name } = resolve({ id, name: raw, latitude: lat, longitude: lon });
    const letters = name.replace(/[^A-Za-z]/g, "");
    assert.notEqual(letters, letters.toUpperCase(), `${name} still shouts`);
  }
});

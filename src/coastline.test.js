import { test } from "node:test";
import assert from "node:assert/strict";
import { isOnLand, inlandMetres, nearestWater } from "./coastline.js";

// Golden points with MEASURED inland distances against the built coastline.
// Natural Earth 1:10m gets several of these wrong, which is why it was rejected.
const GOLDEN = [
  ["Everett gauge",                    47.9800, -122.2230, 0],
  ["Cherry Point gauge",               48.8630, -122.7590, 0],
  ["mid Strait of Georgia",            48.9000, -123.2000, 0],
  // Correctly sited on a pier - land, but nowhere near the reporting threshold.
  ["Friday Harbor gauge (on a pier)",  48.5460, -123.0130, 31],
];

for (const [label, lat, lon, expected] of GOLDEN) {
  test(`${label} is ${expected} m inland`, () => {
    // Coastline generalisation moves this a little; the band is what matters.
    const actual = inlandMetres(lat, lon);
    if (expected === 0) assert.equal(actual, 0);
    else assert.ok(Math.abs(actual - expected) <= 40, `expected ~${expected} m, got ${actual}`);
  });
}

test("deep inland reads as deeply inland", () => {
  // Mount Vernon is kilometres from salt water in every direction.
  assert.ok(inlandMetres(48.42, -122.33) > 1000);
});

test("a pier-mounted gauge is under the reporting threshold", () => {
  // The rule the 200 m tolerance exists to encode: piers are not errors.
  assert.ok(inlandMetres(48.546, -123.013) < 200);
});

test("nearest water from an inland point is in water and close by", () => {
  const found = nearestWater(48.5100, -122.6100);
  assert.equal(isOnLand(found.latitude, found.longitude), false);
  assert.ok(found.metres > 0 && found.metres < 5000, `got ${found.metres} m`);
});

test("nearest water from a point already in water is itself", () => {
  const found = nearestWater(48.9, -123.2);
  assert.equal(found.metres, 0);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCorrections, validateAgainstStations } from "./corrections.js";

const everett = { id: "noaa/9447659", name: "Everett", latitude: 47.98, longitude: -122.223 };

test("accepts a correction that nudges a station off a chart-drawn pier", () => {
  // ~250 m — the shape of an actual fix.
  const map = loadCorrections(`
noaa/9447659:
  position: [47.9822, -122.2232]
  reason: published position sits on the pier deck
`);
  assert.deepEqual(validateAgainstStations(map, [everett]), []);
});

test("flags a correction that relocates a station instead of fixing it", () => {
  // Friday Harbor — right place for a station, wrong station.
  const map = loadCorrections(`
noaa/9447659:
  position: [48.546, -123.013]
  reason: looked wrong on the map
`);
  const problems = validateAgainstStations(map, [everett]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /noaa\/9447659/);
  assert.match(problems[0], /km from the published/);
});

test("the limit is the boundary, and it is configurable", () => {
  // 0.9° of latitude ≈ 100 km due north of Everett.
  const map = loadCorrections(`
noaa/9447659:
  position: [48.88, -122.223]
  reason: far
`);
  assert.equal(validateAgainstStations(map, [everett]).length, 1);
  assert.deepEqual(validateAgainstStations(map, [everett], { maxKm: 200 }), []);
});

test("skips a correction for a station the caller did not supply", () => {
  // A partial stations list (tides but not currents) must not read as an error.
  const map = loadCorrections(`
chs-active-pass:
  position: [48.86, -123.29]
  reason: typo
`);
  assert.deepEqual(validateAgainstStations(map, [everett]), []);
});

test("skips records with no position, and malformed ones validateCorrections owns", () => {
  const map = loadCorrections(`
noaa/9447659:
  name: Everett
noaa/9448682:
  position: 5
  reason: nonsense
`);
  assert.deepEqual(validateAgainstStations(map, [everett]), []);
});

test("survives a stations list that is missing or shaped wrong", () => {
  const map = loadCorrections(`
noaa/9447659:
  position: [48.546, -123.013]
  reason: far
`);
  assert.deepEqual(validateAgainstStations(map, undefined), []);
  assert.deepEqual(validateAgainstStations(map, []), []);
  assert.deepEqual(validateAgainstStations(map, [null, {}, { id: "noaa/9447659" }]), []);
});

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
noaa/8:
  position: 5
  reason: nonsense
`);
  assert.deepEqual(validateAgainstStations(map, [everett]), []);
});

// Real corrections and their real published names — the value of this check
// is entirely in whether it fires on the right ones and stays quiet on the
// rest, so it is worth testing against actual data rather than fixtures.
test("flags a curated name that shares no word with the station it's attached to", () => {
  // Issue #6: name: Anacortes curated onto a Swinomish Channel gauge.
  const swinomish = { id: "noaa/9448682", name: "Swinomish Channel ent., Padilla Bay", latitude: 48.4583, longitude: -122.513 };
  const map = loadCorrections(`
noaa/9448682:
  name: Anacortes
  context: Guemes Channel
`);
  const problems = validateAgainstStations(map, [swinomish]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /noaa\/9448682/);
  assert.match(problems[0], /shares no meaningful word/);
});

test("does not flag a curated name that matches the published name exactly", () => {
  const map = loadCorrections(`
noaa/9447659:
  name: Everett
`);
  assert.deepEqual(validateAgainstStations(map, [everett]), []);
});

test("does not flag an abbreviation expansion that shares a distinctive word", () => {
  const nas = { id: "noaa/9447973", name: "NAS Whidbey Island", latitude: 48.343, longitude: -122.686 };
  const map = loadCorrections(`
noaa/9447973:
  name: Naval Air Station Whidbey Island
`);
  assert.deepEqual(validateAgainstStations(map, [nas]), []);
});

test("does not flag a shared distinctive word even though the two names also share only stop words otherwise", () => {
  const sandyPoint = { id: "noaa/9446804", name: "SANDY POINT ANDERSON ISLAND, PUGET SOUND", latitude: 47.153, longitude: -122.675 };
  const map = loadCorrections(`
noaa/9446804:
  name: Sandy Point
`);
  assert.deepEqual(validateAgainstStations(map, [sandyPoint]), []);
});

test("does not flag a curated name against a raw name carrying extra qualifiers", () => {
  const bremerton = { id: "noaa/9445958", name: "Bremerton, Sinclair Inlet, Port Orchard", latitude: 47.5617, longitude: -122.623 };
  const map = loadCorrections(`
noaa/9445958:
  name: Bremerton
`);
  assert.deepEqual(validateAgainstStations(map, [bremerton]), []);
});

test("ignores generic geographic words so two unrelated 'Point' stations don't match", () => {
  const otherPointStation = { id: "noaa/1", name: "Some Other Point", latitude: 47.0, longitude: -122.0 };
  const map = loadCorrections(`
noaa/1:
  name: Totally Different Point
`);
  const problems = validateAgainstStations(map, [otherPointStation]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /shares no meaningful word/);
});

test("skips the name check when the correction sets no name", () => {
  const map = loadCorrections(`
noaa/9447659:
  context: Port Gardner
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

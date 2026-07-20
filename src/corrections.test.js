import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCorrections, validateCorrections } from "./corrections.js";

const VALID = `
noaa/9447659:
  name: Everett
  context: Port Gardner
  slug: everett
  cities: [Everett, Marysville]
  aliases: [port gardner]
noaa/9448682:
  name: Anacortes
  context: Guemes Channel
  slug: anacortes
  position: [48.5163, -122.6142]
  reason: "published position is inland on Fidalgo Island"
`;

test("loads records keyed by station id", () => {
  const map = loadCorrections(VALID);
  assert.equal(map.get("noaa/9447659").context, "Port Gardner");
  assert.deepEqual(map.get("noaa/9448682").position, [48.5163, -122.6142]);
});

test("accepts a valid file", () => {
  assert.deepEqual(validateCorrections(loadCorrections(VALID)), []);
});

test("requires a reason whenever a position is corrected", () => {
  const map = loadCorrections(`
noaa/1:
  position: [48.5, -122.6]
`);
  const problems = validateCorrections(map);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /noaa\/1.*reason/);
});

test("rejects a context that restates the name", () => {
  // The failure mode a nearest-town derivation walks into.
  const map = loadCorrections(`
noaa/1:
  name: Everett
  context: Everett
`);
  assert.match(validateCorrections(map)[0], /context repeats the name/);
});

test("rejects duplicate slugs", () => {
  const map = loadCorrections(`
noaa/1:
  slug: everett
noaa/2:
  slug: everett
`);
  assert.match(validateCorrections(map)[0], /duplicate slug/);
});

test("rejects an implausible position", () => {
  const map = loadCorrections(`
noaa/1:
  position: [148.5, -122.6]
  reason: typo
`);
  assert.match(validateCorrections(map)[0], /latitude/);
});

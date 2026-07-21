import { test } from "node:test";
import assert from "node:assert/strict";
import { createResolver } from "./resolve.js";
import { loadCorrections } from "./corrections.js";

const corrections = loadCorrections(`
noaa/9447659:
  name: Everett
  context: Port Gardner
  slug: everett
  cities: [Everett]
noaa/9448682:
  name: Anacortes
  context: Guemes Channel
  position: [48.5163, -122.6142]
  reason: inland
`);

// Minimal gazetteer: name, lat, lon.
const gazetteer = [
  { name: "Forks", region: "WA", latitude: 47.95, longitude: -124.385 },
  { name: "Everett", region: "WA", latitude: 47.979, longitude: -122.202 },
];

const resolve = createResolver({ corrections, gazetteer });

test("a curated override wins outright", () => {
  const r = resolve({ id: "noaa/9447659", name: "Everett", latitude: 47.98, longitude: -122.223 });
  assert.equal(r.name, "Everett");
  assert.equal(r.context, "Port Gardner");
  assert.equal(r.slug, "everett");
  assert.equal(r.derived, false);
});

test("a corrected position replaces the published one", () => {
  const r = resolve({ id: "noaa/9448682", name: "ANACORTES", latitude: 48.51, longitude: -122.61 });
  assert.equal(r.latitude, 48.5163);
  assert.equal(r.longitude, -122.6142);
  assert.equal(r.corrected, true);
});

test("an uncorrected station still gets a cleaned name and a slug", () => {
  const r = resolve({ id: "noaa/1", name: "CHERRY POINT", latitude: 48.863, longitude: -122.759 });
  assert.equal(r.name, "Cherry Point");
  assert.equal(r.slug, "cherry-point");
  assert.equal(r.corrected, false);
});

test("context falls back to the nearest gazetteer place", () => {
  const r = resolve({ id: "noaa/2", name: "Jim Creek", latitude: 48.187, longitude: -124.063 });
  assert.equal(r.context, "near Forks, WA");
  assert.equal(r.derived, true);
});

test("a derived context never restates the name", () => {
  // Nearest place to the Everett station IS Everett; repeating it is the bug.
  const r = resolve({ id: "noaa/3", name: "Everett", latitude: 47.979, longitude: -122.202 });
  assert.notEqual(r.context.toLowerCase(), "everett");
  assert.equal(r.context, "");
});

test("a derived context is suppressed even when it only overlaps the name as a phrase", () => {
  // Exact-equality would miss this: "Everett" inside "Everett Marina" is the
  // same restating-the-name mistake validateCorrections rejects from a human.
  const r = resolve({ id: "noaa/4", name: "Everett Marina", latitude: 47.979, longitude: -122.202 });
  assert.equal(r.context, "");
});

test("aliases always include the name and the slug", () => {
  const r = resolve({ id: "noaa/1", name: "CHERRY POINT", latitude: 48.863, longitude: -122.759 });
  assert.ok(r.aliases.includes("cherry point"));
  assert.ok(r.aliases.includes("cherry-point"));
});

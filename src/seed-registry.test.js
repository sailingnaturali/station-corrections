import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadRegistry, validateRegistry } from "./registry.js";
import { loadCorrections } from "./corrections.js";
import { createResolver } from "./resolve.js";
import { validatePositions, coverageWarnings } from "./validate-positions.js";

const read = (name) =>
  readFileSync(fileURLToPath(new URL(`../data/${name}`, import.meta.url)), "utf8");

const registry = loadRegistry(read("registry.yaml"));
const corrections = loadCorrections(read("corrections.yaml"));
const resolve = createResolver({ registry, corrections });

test("the shipped registry is valid against the shipped corrections", () => {
  assert.deepEqual(validateRegistry(registry, { corrections }), []);
});

// The one non-CHS entry: a NOAA current station carried here because
// currents-vault, which curates the same 20 gates, is dropping station
// identity in favour of this registry. Named so a station going missing or a
// provider silently changing (either direction) still fails loudly.
const NOAA_GATES = ["noaa-boundary-pass"];

test("every CHS gate in the fitting pipeline is present, plus the one NOAA gate", () => {
  assert.equal(registry.size, 19 + NOAA_GATES.length);
  for (const [id, record] of registry) {
    if (NOAA_GATES.includes(id)) {
      assert.equal(record.provider, "noaa", `${id} is not a noaa provider`);
    } else {
      assert.ok(id.startsWith("chs-"), `${id} is not a chs key`);
      assert.equal(record.provider, "chs");
    }
  }
});

test("every station resolves with a name, a context and a position", () => {
  for (const id of registry.keys()) {
    const r = resolve({ id });
    assert.ok(r.name, `${id} has no name`);
    assert.notEqual(r.context, "", `${id} has no context`);
    assert.equal(typeof r.latitude, "number", `${id} has no latitude`);
    assert.equal(typeof r.longitude, "number", `${id} has no longitude`);
    assert.equal(r.corrected, false);
    assert.equal(r.derived, false);
  }
});

test("slugs are unique across the registry", () => {
  const slugs = [...registry.keys()].map((id) => resolve({ id }).slug);
  assert.equal(new Set(slugs).size, slugs.length);
});

// The three northern gates sit outside the coastline clip. Pinned so that a
// future coastline covering them changes this test visibly, rather than
// silently converting an unverifiable position into a verified one.
const OUTSIDE_COVERAGE = [
  "chs-blackney-passage",
  "chs-johnstone-strait-central",
  "chs-weynton-passage",
];

test("only the known northern gates are outside coastline coverage", () => {
  const warned = coverageWarnings(registry).map((w) => w.split(":")[0]);
  assert.deepEqual(warned.sort(), [...OUTSIDE_COVERAGE].sort());
});

// The spec requires every registry position to be either confirmed in water
// or reported as outside coverage. The test above pins the three
// out-of-coverage gates; this pins the other 16 as actually in water -
// without it, a registry position drifting onto land would pass silently.
test("every in-coverage registry position is in water", () => {
  assert.deepEqual(validatePositions(registry), []);
});

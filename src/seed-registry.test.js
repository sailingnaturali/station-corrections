import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadRegistry, validateRegistry } from "./registry.js";
import { loadCorrections } from "./corrections.js";
import { createResolver } from "./resolve.js";
import { coverageWarnings } from "./validate-positions.js";

const read = (name) =>
  readFileSync(fileURLToPath(new URL(`../data/${name}`, import.meta.url)), "utf8");

const registry = loadRegistry(read("registry.yaml"));
const corrections = loadCorrections(read("corrections.yaml"));
const resolve = createResolver({ registry, corrections });

test("the shipped registry is valid against the shipped corrections", () => {
  assert.deepEqual(validateRegistry(registry, { corrections }), []);
});

test("every CHS gate in the fitting pipeline is present", () => {
  assert.equal(registry.size, 19);
  for (const [id, record] of registry) {
    assert.ok(id.startsWith("chs-"), `${id} is not a chs key`);
    assert.equal(record.provider, "chs");
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

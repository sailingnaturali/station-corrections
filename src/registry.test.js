import { test } from "node:test";
import assert from "node:assert/strict";
import { loadRegistry, validateRegistry } from "./registry.js";
import { loadCorrections } from "./corrections.js";

const VALID = `
chs-dodd-narrows:
  name: Dodd Narrows
  context: Nanaimo
  position: [49.1344, -123.8171]
  provider: chs
  providerId: 63aef1866a2b9417c035030f
  cities: [Nanaimo]
  aliases: [dodd]
`;

test("loads records keyed by station id", () => {
  const registry = loadRegistry(VALID);
  assert.equal(registry.get("chs-dodd-narrows").name, "Dodd Narrows");
  assert.deepEqual(registry.get("chs-dodd-narrows").position, [49.1344, -123.8171]);
});

test("accepts a valid registry", () => {
  assert.deepEqual(validateRegistry(loadRegistry(VALID)), []);
});

test("requires name, position, provider and providerId", () => {
  const problems = validateRegistry(loadRegistry("chs-x:\n  context: Somewhere\n"));
  assert.equal(problems.length, 4);
  for (const field of ["name", "position", "provider", "providerId"]) {
    assert.ok(problems.some((p) => p.includes(field)), `no problem mentioned ${field}`);
  }
});

test("rejects a malformed position", () => {
  const problems = validateRegistry(loadRegistry(`
chs-x:
  name: X
  position: 5
  provider: chs
  providerId: abc
`));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /position must be/);
});

test("rejects an out-of-range latitude", () => {
  const problems = validateRegistry(loadRegistry(`
chs-x:
  name: X
  position: [95, -123]
  provider: chs
  providerId: abc
`));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /latitude 95 is out of range/);
});

test("rejects a context that restates the name", () => {
  const problems = validateRegistry(loadRegistry(`
chs-dodd-narrows:
  name: Dodd Narrows
  context: Dodd Narrows Approach
  position: [49.1344, -123.8171]
  provider: chs
  providerId: abc
`));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /context repeats the name/);
});

test("rejects a malformed slug and duplicate slugs within the registry", () => {
  const problems = validateRegistry(loadRegistry(`
chs-a:
  name: A
  slug: Not A Slug
  position: [49, -123]
  provider: chs
  providerId: a
chs-b:
  name: B
  slug: dupe
  position: [49, -123]
  provider: chs
  providerId: b
chs-c:
  name: C
  slug: dupe
  position: [49, -123]
  provider: chs
  providerId: c
`));
  assert.equal(problems.length, 2);
  assert.ok(problems.some((p) => /must be lowercase/.test(p)));
  assert.ok(problems.some((p) => /duplicate slug "dupe"/.test(p)));
});

test("reports rather than throws on wrong types", () => {
  const problems = validateRegistry(loadRegistry(`
chs-x:
  name: 5
  position: [49, -123]
  provider: chs
  providerId: abc
  cities: "Nanaimo"
`));
  assert.ok(problems.some((p) => /name must be a string/.test(p)));
  assert.ok(problems.some((p) => /cities must be an array of strings/.test(p)));
});

test("an empty registry is valid", () => {
  assert.deepEqual(validateRegistry(loadRegistry("")), []);
});

test("a station declared in both files is rejected", () => {
  const registry = loadRegistry(`
chs-dodd-narrows:
  name: Dodd Narrows
  position: [49.1344, -123.8171]
  provider: chs
  providerId: abc
`);
  const corrections = loadCorrections("chs-dodd-narrows:\n  name: Dodd\n");
  const problems = validateRegistry(registry, { corrections });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /both the registry and corrections/);
});

test("a slug colliding across files is rejected", () => {
  const registry = loadRegistry(`
chs-dodd-narrows:
  name: Dodd Narrows
  slug: nanaimo
  position: [49.1344, -123.8171]
  provider: chs
  providerId: abc
`);
  const corrections = loadCorrections("noaa/1:\n  name: Nanaimo\n  slug: nanaimo\n");
  const problems = validateRegistry(registry, { corrections });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /collides with chs-dodd-narrows/);
});

test("corrections with no overlap produce no cross-file problems", () => {
  const registry = loadRegistry(VALID);
  const corrections = loadCorrections("noaa/1:\n  name: Everett\n  slug: everett\n");
  assert.deepEqual(validateRegistry(registry, { corrections }), []);
});

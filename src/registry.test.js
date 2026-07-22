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

test("requires name, position and provider", () => {
  const problems = validateRegistry(loadRegistry("chs-x:\n  context: Somewhere\n"));
  assert.equal(problems.length, 3);
  for (const field of ["name", "position", "provider"]) {
    assert.ok(problems.some((p) => p.includes(field)), `no problem mentioned ${field}`);
  }
});

test("rejects a malformed position", () => {
  const problems = validateRegistry(loadRegistry(`
chs-x:
  name: X
  position: 5
  provider: chs
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
chs-b:
  name: B
  slug: dupe
  position: [49, -123]
  provider: chs
chs-c:
  name: C
  slug: dupe
  position: [49, -123]
  provider: chs
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

test("two registry entries with derived (unset) slugs that collide are rejected", () => {
  const problems = validateRegistry(loadRegistry(`
chs-a:
  name: Friday Harbor
  position: [48.5, -123]
  provider: chs
chs-b:
  name: Friday Harbor
  position: [48.5, -123]
  provider: chs
`));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /duplicate slug "friday-harbor"/);
});

test("a registry entry's derived slug colliding with a corrections entry's explicit slug is rejected", () => {
  const registry = loadRegistry(`
chs-dodd-narrows:
  name: Nanaimo
  position: [49.1344, -123.8171]
  provider: chs
`);
  const corrections = loadCorrections("noaa/1:\n  name: Somewhere Else\n  slug: nanaimo\n");
  const problems = validateRegistry(registry, { corrections });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /collides with chs-dodd-narrows/);
});

test("accepts valid formerSlugs on a registry entry", () => {
  const problems = validateRegistry(loadRegistry(`
chs-dodd-narrows:
  name: Dodd Narrows
  position: [49.1344, -123.8171]
  provider: chs
  formerSlugs: [old-dodd]
`));
  assert.deepEqual(problems, []);
});

test("rejects a malformed formerSlugs entry on a registry entry", () => {
  const problems = validateRegistry(loadRegistry(`
chs-x:
  name: X
  position: [49, -123]
  provider: chs
  formerSlugs: [Not A Slug]
`));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /formerSlugs entry "Not A Slug" must be lowercase/);
});

test("rejects a registry slug colliding with another registry entry's formerSlugs", () => {
  const problems = validateRegistry(loadRegistry(`
chs-a:
  name: A
  position: [49, -123]
  provider: chs
  formerSlugs: [old-b]
chs-b:
  name: B
  slug: old-b
  position: [49, -123]
  provider: chs
`));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /chs-b: slug "old-b" collides with a former slug of chs-a/);
});

test("rejects a registry slug colliding with a corrections entry's formerSlugs", () => {
  const registry = loadRegistry(`
chs-dodd-narrows:
  name: Nanaimo
  position: [49.1344, -123.8171]
  provider: chs
`);
  const corrections = loadCorrections("noaa/1:\n  formerSlugs: [nanaimo]\n");
  const problems = validateRegistry(registry, { corrections });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /chs-dodd-narrows: slug "nanaimo" collides with a former slug of noaa\/1/);
});

test("rejects a corrections slug colliding with a registry entry's formerSlugs", () => {
  const registry = loadRegistry(`
chs-dodd-narrows:
  name: Dodd Narrows
  position: [49.1344, -123.8171]
  provider: chs
  formerSlugs: [nanaimo]
`);
  const corrections = loadCorrections("noaa/1:\n  name: Nanaimo\n  slug: nanaimo\n");
  const problems = validateRegistry(registry, { corrections });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /noaa\/1: slug "nanaimo" collides with a former slug of chs-dodd-narrows/);
});

test("a registry entry with no slug and no name does not throw or register a bogus slug", () => {
  const registry = loadRegistry(`
chs-a:
  position: [49, -123]
  provider: chs
chs-b:
  name: undefined
  position: [49, -123]
  provider: chs
`);
  const problems = validateRegistry(registry);
  assert.ok(problems.some((p) => /chs-a: name is required/.test(p)));
  assert.ok(!problems.some((p) => /duplicate slug/.test(p)));
});


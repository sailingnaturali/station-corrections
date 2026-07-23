import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSlugsLock, readSlugsLock, checkSlugs } from "./slugs-lock.js";
import { loadCorrections } from "./corrections.js";
import { loadRegistry } from "./registry.js";

test("builds a lock mapping id to current slug, explicit-only for corrections and effective for the registry", () => {
  const corrections = loadCorrections(`
noaa/1:
  name: Everett
  slug: everett
noaa/2:
  name: Uncurated Name
`);
  const registry = loadRegistry(`
chs-a:
  name: Active Pass
  position: [48.86, -123.31]
  provider: chs
`);
  const lock = buildSlugsLock(corrections, registry);
  assert.equal(lock.slugs["noaa/1"], "everett");
  assert.equal(lock.slugs["chs-a"], "active-pass");
  // noaa/2 sets no explicit slug, so its slug is not derivable from the
  // corrections file alone (the provider's raw name is needed) - same gap
  // validateCorrections/validateRegistry already leave open.
  assert.equal("noaa/2" in lock.slugs, false);
});

test("the lock round-trips through JSON", () => {
  const corrections = loadCorrections("noaa/1:\n  slug: everett\n");
  const lock = buildSlugsLock(corrections, new Map());
  const reread = readSlugsLock(JSON.stringify(lock));
  assert.deepEqual(reread.slugs, lock.slugs);
});

test("a clean lock passes check-slugs", () => {
  const corrections = loadCorrections("noaa/1:\n  slug: everett\n");
  const lock = buildSlugsLock(corrections, new Map());
  assert.deepEqual(checkSlugs(lock, corrections, new Map()), []);
});

test("a slug change with the old value in formerSlugs passes check-slugs", () => {
  const corrections = loadCorrections("noaa/1:\n  slug: everett\n");
  const lock = buildSlugsLock(corrections, new Map());
  const changed = loadCorrections("noaa/1:\n  slug: everett-wa\n  formerSlugs: [everett]\n");
  assert.deepEqual(checkSlugs(lock, changed, new Map()), []);
});

test("the same change without formerSlugs fails, naming the station and both slugs", () => {
  const corrections = loadCorrections("noaa/1:\n  slug: everett\n");
  const lock = buildSlugsLock(corrections, new Map());
  const changed = loadCorrections("noaa/1:\n  slug: everett-wa\n");
  const problems = checkSlugs(lock, changed, new Map());
  assert.equal(problems.length, 1);
  assert.match(problems[0], /noaa\/1/);
  assert.match(problems[0], /everett/);
  assert.match(problems[0], /everett-wa/);
});

test("a hand-edited slug is detected even when formerSlugs records some other value", () => {
  const corrections = loadCorrections("noaa/1:\n  slug: everett\n");
  const lock = buildSlugsLock(corrections, new Map());
  const changed = loadCorrections("noaa/1:\n  slug: everett-wa\n  formerSlugs: [something-else]\n");
  const problems = checkSlugs(lock, changed, new Map());
  assert.equal(problems.length, 1);
});

test("a registry slug change is checked the same way", () => {
  const registry = loadRegistry(`
chs-a:
  name: Active Pass
  position: [48.86, -123.31]
  provider: chs
`);
  const lock = buildSlugsLock(new Map(), registry);
  const renamed = loadRegistry(`
chs-a:
  name: Active Pass Gate
  position: [48.86, -123.31]
  provider: chs
`);
  const problems = checkSlugs(lock, new Map(), renamed);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /chs-a/);
});

test("a station in the data but absent from the lock fails - its slug entered the API unguarded (#8)", () => {
  const lock = buildSlugsLock(new Map(), new Map());
  const corrections = loadCorrections("noaa/1:\n  slug: everett\n");
  const problems = checkSlugs(lock, corrections, new Map());
  assert.equal(problems.length, 1);
  assert.match(problems[0], /noaa\/1/);
  assert.match(problems[0], /everett/);
  assert.match(problems[0], /lock/);
});

test("a station removed from the data but still in the lock fails - its slug is now dead (#8)", () => {
  const corrections = loadCorrections("noaa/1:\n  slug: everett\n");
  const lock = buildSlugsLock(corrections, new Map());
  const problems = checkSlugs(lock, new Map(), new Map());
  assert.equal(problems.length, 1);
  assert.match(problems[0], /noaa\/1/);
  assert.match(problems[0], /everett/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCorrections } from "./corrections.js";
import { validatePositions } from "./validate-positions.js";

test("flags a corrected position that is still on land", () => {
  // Mount Vernon - kilometres from salt water in every direction.
  const map = loadCorrections(`
noaa/1:
  position: [48.42, -122.33]
  reason: typo
`);
  const problems = validatePositions(map);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /noaa\/1/);
  assert.match(problems[0], /land/);
});

test("accepts a corrected position that is in water", () => {
  // Mid Strait of Georgia.
  const map = loadCorrections(`
noaa/1:
  position: [48.9, -123.2]
  reason: typo
`);
  assert.deepEqual(validatePositions(map), []);
});

test("skips records with no position", () => {
  const map = loadCorrections(`
noaa/1:
  name: Everett
`);
  assert.deepEqual(validatePositions(map), []);
});

test("does not throw on a malformed position - validateCorrections already reports that", () => {
  const map = loadCorrections(`
noaa/1:
  position: 5
`);
  assert.doesNotThrow(() => validatePositions(map));
  assert.deepEqual(validatePositions(map), []);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { toSlug } from "./slug.js";

test("makes a readable url segment", () => {
  assert.equal(toSlug("Friday Harbor"), "friday-harbor");
  assert.equal(toSlug("Deception Pass State Park"), "deception-pass-state-park");
});

test("drops punctuation rather than encoding it", () => {
  assert.equal(toSlug("Seattle (Madison St.)"), "seattle-madison-st");
  assert.equal(toSlug("Spee-Bi-Dah"), "spee-bi-dah");
});

test("strips accents to keep urls ascii", () => {
  assert.equal(toSlug("Cañon Point"), "canon-point");
});

test("never emits leading, trailing or doubled hyphens", () => {
  assert.equal(toSlug("  --Union--  "), "union");
});

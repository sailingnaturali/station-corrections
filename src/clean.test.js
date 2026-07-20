import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanName } from "./clean.js";

test("calms names that shout", () => {
  assert.equal(cleanName("CHERRY POINT"), "Cherry Point");
  assert.equal(cleanName("PORT TOWNSEND"), "Port Townsend");
  assert.equal(cleanName("SPEE-BI-DAH"), "Spee-Bi-Dah");
});

test("leaves human-cased names untouched", () => {
  // These carry capitalisation we could not reconstruct if we flattened them.
  for (const name of ["Spee-Bi-Dah", "La Push", "Friday Harbor", "McArthur Bank"]) {
    assert.equal(cleanName(name), name);
  }
});

test("keeps acronyms that are not shouting", () => {
  assert.equal(cleanName("NAS Whidbey Island"), "Naval Air Station Whidbey Island");
});

test("expands the abbreviations that read badly", () => {
  assert.equal(cleanName("Swinomish Channel ent."), "Swinomish Channel Entrance");
  assert.equal(cleanName("Deception Pass St. Park"), "Deception Pass State Park");
  assert.equal(cleanName("Hanbury Point, San Juan I."), "Hanbury Point, San Juan Island");
});

test("collapses whitespace", () => {
  assert.equal(cleanName("  Port   Angeles "), "Port Angeles");
});

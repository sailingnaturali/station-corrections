import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildLock, diffLock } from "./lock.js";
import { createResolver } from "./resolve.js";
import { loadCorrections } from "./corrections.js";

const resolve = createResolver({ corrections: loadCorrections("") });

// Trivial stand-in for audit.js's classify() - lock.js takes classify as a
// parameter precisely so it never has to import the coastline-parsing chain
// itself, so this test suite should not need real coastline data either.
function classify(resolved) {
  return resolved.positionVerified ? { verdict: "verified" } : { verdict: "clear" };
}

test("does not statically depend on the coastline-parsing modules", () => {
  // lock.js must be importable (and diffLock/readLock usable) without paying
  // for the 3.6 MB coastline parse - that only happens inside classify(),
  // which the caller now injects instead of lock.js importing it itself.
  const source = readFileSync(fileURLToPath(new URL("./lock.js", import.meta.url)), "utf8");
  assert.doesNotMatch(source, /["']\.\/coastline\.js["']/);
  assert.doesNotMatch(source, /["']\.\/audit\.js["']/);
});
const STATIONS = [
  { id: "noaa/1", name: "Alpha", latitude: 48.9, longitude: -123.2 },
  { id: "noaa/2", name: "Beta", latitude: 48.8, longitude: -123.1 },
];

test("records every station with its position and verdict", () => {
  const lock = buildLock(STATIONS, { resolve, classify, coastlineFingerprint: "sha256-abc", thresholdM: 200 });
  assert.equal(lock.coastline, "sha256-abc");
  assert.equal(lock.thresholdM, 200);
  assert.deepEqual(lock.stations["noaa/1"].position, [48.9, -123.2]);
  assert.ok(["clear", "verified", "ashore"].includes(lock.stations["noaa/1"].verdict));
});

test("reports a station that has moved", () => {
  const lock = buildLock(STATIONS, { resolve, classify, coastlineFingerprint: "sha256-abc", thresholdM: 200 });
  const moved = [{ ...STATIONS[0], latitude: 48.95 }, STATIONS[1]];
  const diff = diffLock(lock, moved, { resolve });
  assert.deepEqual(diff.moved.map((m) => m.id), ["noaa/1"]);
  assert.deepEqual(diff.unchanged, ["noaa/2"]);
});

test("reports stations added and removed upstream", () => {
  const lock = buildLock(STATIONS, { resolve, classify, coastlineFingerprint: "sha256-abc", thresholdM: 200 });
  const changed = [STATIONS[0], { id: "noaa/3", name: "Gamma", latitude: 48.7, longitude: -123.0 }];
  const diff = diffLock(lock, changed, { resolve });
  assert.deepEqual(diff.added, ["noaa/3"]);
  assert.deepEqual(diff.removed, ["noaa/2"]);
});

test("a correction that moves a station counts as moved", () => {
  // The lock pins the RESOLVED position, so writing a position correction must
  // show up - that is a human changing the data and it should be reviewable.
  const lock = buildLock(STATIONS, { resolve, classify, coastlineFingerprint: "sha256-abc", thresholdM: 200 });
  const corrected = createResolver({
    corrections: loadCorrections(`
noaa/1:
  position: [48.91, -123.21]
  reason: test
`),
  });
  const diff = diffLock(lock, STATIONS, { resolve: corrected });
  assert.deepEqual(diff.moved.map((m) => m.id), ["noaa/1"]);
});

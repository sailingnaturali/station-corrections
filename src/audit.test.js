import { test } from "node:test";
import assert from "node:assert/strict";
import { auditStations, classify } from "./audit.js";
import { createResolver } from "./resolve.js";
import { loadCorrections } from "./corrections.js";

const resolve = createResolver({ corrections: loadCorrections("") });

test("reports a station whose published position is ashore", () => {
  // 48.515, -122.62 measures ~433 m inland against the bundled coastline -
  // comfortably past REPORT_THRESHOLD_M, unlike the pier-scale offsets a
  // correctly sited gauge produces. (The brief's original 48.51, -122.61 is
  // only ~90 m inland here - under threshold - so it wouldn't be reported;
  // swapped in a coordinate that actually clears the bar.)
  const findings = auditStations(
    [{ id: "noaa/8", name: "ANACORTES", latitude: 48.515, longitude: -122.62 }],
    { resolve },
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].name, "Anacortes");
  assert.ok(findings[0].metresInland > 0);
  assert.ok(findings[0].suggestion.latitude);
});

test("says nothing about a station already in water", () => {
  const findings = auditStations(
    [{ id: "noaa/1", name: "Friday Harbor", latitude: 48.546, longitude: -123.013 }],
    { resolve },
  );
  assert.deepEqual(findings, []);
});

test("does not re-report a station that has already been corrected", () => {
  // The correction moves it into the water (verified against the bundled
  // coastline - nearestWater(48.51, -122.61) resolves here); the audit must
  // respect that rather than the pre-correction position tested above.
  const corrected = createResolver({
    corrections: loadCorrections(`
noaa/8:
  position: [48.5108, -122.6098]
  reason: inland
`),
  });
  const findings = auditStations(
    [{ id: "noaa/8", name: "ANACORTES", latitude: 48.515, longitude: -122.62 }],
    { resolve: corrected },
  );
  assert.deepEqual(findings, []);
});

test("a custom thresholdM changes which stations are reported", () => {
  // Friday Harbor, 48.5460, -123.0130: measured 31 m inland against the
  // bundled coastline - correctly sited under the 200 m default (a gauge on
  // a pier), but past a stricter 20 m threshold. Same station, same
  // resolver; only thresholdM differs.
  const station = { id: "noaa/9449880", name: "FRIDAY HARBOR", latitude: 48.546, longitude: -123.013 };

  const atDefault = auditStations([station], { resolve });
  assert.deepEqual(atDefault, []);

  const atStrictThreshold = auditStations([station], { resolve, thresholdM: 20 });
  assert.equal(atStrictThreshold.length, 1);
  assert.equal(atStrictThreshold[0].metresInland, 31);
});

test("reports rather than throws when no water is found within range", () => {
  // Whistler, BC: on land, past the threshold, and has no mapped water within
  // nearestWater's 20 km search radius - it throws. A batch audit of many
  // stations must survive one bad coordinate, so the audit must catch this
  // and still report the station rather than dying mid-run.
  const findings = auditStations(
    [{ id: "test/whistler", name: "WHISTLER", latitude: 50.12, longitude: -122.95 }],
    { resolve },
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].metresInland, Infinity);
  assert.equal(findings[0].suggestion, null);
});

test("classify refuses to call an uncovered position clear", () => {
  const resolved = { id: "x", name: "X", latitude: 50.6033, longitude: -126.8117 };
  assert.deepEqual(classify(resolved), { verdict: "unverifiable" });
});

test("does not report a station whose position is verified correct", () => {
  const verified = createResolver({
    corrections: loadCorrections(`
noaa/9442396:
  positionVerified: "up the Quillayute River; the coastline maps ocean only"
`),
  });
  const findings = auditStations(
    [{ id: "noaa/9442396", name: "La Push", latitude: 47.91284, longitude: -124.63574 }],
    { resolve: verified },
  );
  assert.deepEqual(findings, []);
});

#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { auditStations, classify, REPORT_THRESHOLD_M } from "../src/audit.js";
import { buildLock, readLock, diffLock } from "../src/lock.js";
import { createBundledResolver } from "../src/index.js";
import { loadCorrections, validateCorrections } from "../src/corrections.js";
import { validatePositions } from "../src/validate-positions.js";
import { fileURLToPath } from "node:url";

const corrections = loadCorrections(
  readFileSync(fileURLToPath(new URL("../data/corrections.yaml", import.meta.url)), "utf8"),
);

const coastlinePath = fileURLToPath(new URL("../data/coastline.geojson", import.meta.url));
const lockPath = fileURLToPath(new URL("../data/audit.lock.json", import.meta.url));

/** SHA-256 of the coastline file, so a lock records which coastline it was built against. */
function coastlineFingerprint() {
  return `sha256-${createHash("sha256").update(readFileSync(coastlinePath)).digest("hex")}`;
}

/** Read, parse and shape-check a stations file, or print a clear message and exit 1. Shared by every command that takes a stations.json argument. */
function loadStations(command, stationsPath) {
  if (!stationsPath) {
    console.error(`usage: station-corrections ${command} <stations.json>`);
    process.exit(1);
  }
  let raw;
  try {
    raw = readFileSync(stationsPath, "utf8");
  } catch (err) {
    console.error(`${command}: could not read ${stationsPath} (${err.code === "ENOENT" ? "no such file" : err.message})`);
    process.exit(1);
  }

  let stations;
  try {
    stations = JSON.parse(raw);
  } catch (err) {
    console.error(`${command}: ${stationsPath} is not valid JSON (${err.message})`);
    process.exit(1);
  }

  if (!Array.isArray(stations) || stations.some((s) => typeof s !== "object" || s === null || Array.isArray(s))) {
    console.error(`${command}: ${stationsPath} must contain a JSON array of station objects`);
    process.exit(1);
  }
  return stations;
}

const [command, stationsPath] = process.argv.slice(2);

if (command === "validate") {
  const problems = [...validateCorrections(corrections), ...validatePositions(corrections)];
  for (const problem of problems) console.error(problem);
  console.error(problems.length ? `\n${problems.length} problem(s)` : "corrections file is valid");
  process.exit(problems.length ? 1 : 0);
}

if (command === "audit") {
  const stations = loadStations("audit", stationsPath);
  const rawResolve = createBundledResolver();
  // Memoized so the lockValid branch below - which resolves each station
  // once inside diffLock and again in its own follow-up loop - does the
  // actual resolve() work only once per station. Keyed by object identity,
  // safe because `stations` is a stable array reused across both passes.
  const resolvedCache = new Map();
  const resolve = (station) => {
    let resolved = resolvedCache.get(station);
    if (!resolved) {
      resolved = rawResolve(station);
      resolvedCache.set(station, resolved);
    }
    return resolved;
  };

  // Reuse a pinned verdict for a station whose resolved position and the
  // audit inputs (coastline, threshold) all still match the lock. Any
  // mismatch on coastline or threshold invalidates every entry at once -
  // both alter every verdict, so nothing in a stale lock can be trusted.
  let lock = null;
  try {
    lock = readLock(readFileSync(lockPath, "utf8"));
  } catch {
    // ponytail: no lock yet (or unreadable) - fall back to a full audit below.
  }
  const lockValid = lock && lock.coastline === coastlineFingerprint() && lock.thresholdM === REPORT_THRESHOLD_M;

  let findings;
  let cached = 0;
  let checked;
  if (lockValid) {
    const unchanged = new Set(diffLock(lock, stations, { resolve }).unchanged);
    const toCheck = [];
    for (const station of stations) {
      const resolved = resolve(station);
      if (unchanged.has(resolved.id) && lock.stations[resolved.id].verdict !== "ashore") {
        cached++;
      } else {
        // Cached-but-ashore still gets a full re-check: the lock only pins
        // metresInland, not the nearest-water suggestion this prints.
        toCheck.push(station);
      }
    }
    findings = auditStations(toCheck, { resolve });
    checked = toCheck.length;
  } else {
    findings = auditStations(stations, { resolve });
    checked = stations.length;
  }

  for (const finding of findings) {
    console.log(`${finding.id.padEnd(16)} ${finding.name.padEnd(24)} ${finding.metresInland} m inland`);
    console.log(
      finding.suggestion
        ? `  nearest water: ${finding.suggestion.latitude}, ${finding.suggestion.longitude}`
        : "  nearest water: none found within range - needs a human look",
    );
  }
  console.log(`\n${cached} cached, ${checked} checked`);
  console.log(`${findings.length} of ${stations.length} ashore`);
  process.exit(0);
}

if (command === "lock") {
  const stations = loadStations("lock", stationsPath);
  const resolve = createBundledResolver();
  const lock = buildLock(stations, { resolve, classify, coastlineFingerprint: coastlineFingerprint(), thresholdM: REPORT_THRESHOLD_M });
  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n");
  console.log(`wrote ${lockPath} - ${stations.length} station(s)`);
  process.exit(0);
}

if (command === "check") {
  const stations = loadStations("check", stationsPath);
  const resolve = createBundledResolver();

  let lock;
  try {
    lock = readLock(readFileSync(lockPath, "utf8"));
  } catch (err) {
    console.error(`check: could not read ${lockPath} (${err.code === "ENOENT" ? "no such file - run \`station-corrections lock\` first" : err.message})`);
    process.exit(1);
  }

  if (lock.coastline !== coastlineFingerprint() || lock.thresholdM !== REPORT_THRESHOLD_M) {
    console.error("check: coastline data or threshold has changed since the lock was written - every verdict is stale, re-run `station-corrections lock`");
    process.exit(1);
  }

  const diff = diffLock(lock, stations, { resolve });
  for (const m of diff.moved) console.error(`MOVED    ${m.id}: ${m.was} -> ${m.now}`);
  for (const id of diff.added) console.error(`ADDED    ${id}`);
  for (const id of diff.removed) console.error(`REMOVED  ${id}`);

  const problems = diff.moved.length + diff.added.length + diff.removed.length;
  if (problems) {
    console.error(`\n${problems} problem(s) - regenerate with \`station-corrections lock\` once reviewed`);
    process.exit(1);
  }
  console.log(`check: ${diff.unchanged.length} station(s) match the lock`);
  process.exit(0);
}

console.error("usage: station-corrections <validate|audit|lock|check> [stations.json]");
process.exit(1);

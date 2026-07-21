/**
 * Pin every station's resolved position and audit verdict.
 *
 * Deliberately does no IO and never imports the coastline-parsing chain
 * (./audit.js -> ./coastline.js) itself — `classify` is injected by the
 * caller (the CLI, which already owns the threshold and `auditStations`'s
 * classify()) so that importing lock.js, or using diffLock/readLock alone,
 * never pays for parsing the 3.6 MB coastline. `classify` itself still needs
 * it, but that cost already exists wherever `auditStations` runs.
 */
export function buildLock(stations, { resolve, classify, coastlineFingerprint, thresholdM } = {}) {
  const entries = {};
  for (const station of stations) {
    const resolved = resolve(station);
    entries[resolved.id] = {
      position: [resolved.latitude, resolved.longitude],
      ...classify(resolved, thresholdM),
    };
  }
  return {
    note:
      "Audit results pinned per station. `station-corrections check` fails when a station has moved since this was written. Regenerate with `station-corrections lock`.",
    generated: new Date().toISOString().slice(0, 10),
    coastline: coastlineFingerprint,
    thresholdM,
    stations: entries,
  };
}

/** Parse a lock from its on-disk JSON string. No validation beyond JSON.parse — the lock is a build artifact, not hand-edited input. */
export function readLock(json) {
  return JSON.parse(json);
}

/**
 * Compare a lock against the current station list.
 *
 * Per station, a cached verdict is trusted only when the *resolved* position
 * matches to full precision — so a human-written correction that moves a
 * station shows up as moved too, same as an upstream position change. That
 * is deliberate: either way, the data changed and it belongs in front of a
 * reviewer, not silently absorbed as "still cached".
 */
export function diffLock(lock, stations, { resolve }) {
  const seen = new Set();
  const moved = [];
  const added = [];
  const unchanged = [];

  for (const station of stations) {
    const resolved = resolve(station);
    seen.add(resolved.id);
    const pinned = lock.stations[resolved.id];
    if (!pinned) {
      added.push(resolved.id);
      continue;
    }
    const [lat, lon] = pinned.position;
    if (lat === resolved.latitude && lon === resolved.longitude) {
      unchanged.push(resolved.id);
    } else {
      moved.push({ id: resolved.id, was: pinned.position, now: [resolved.latitude, resolved.longitude] });
    }
  }

  const removed = Object.keys(lock.stations).filter((id) => !seen.has(id));

  return { moved, added, removed, unchanged };
}

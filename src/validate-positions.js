import { isOnLand } from "./coastline.js";

/**
 * Check that a corrections file's position overrides actually land in
 * water. Requires the coastline, so this is kept apart from
 * validateCorrections - that one stays dependency-free for callers (the
 * library entry point included) that never load the coastline.
 *
 * Only checks "is this in water", not distance from the originally
 * published position: the corrections file does not carry the published
 * position to compare against.
 *
 * Malformed positions (wrong shape, non-numeric) are skipped here -
 * validateCorrections already reports those.
 */
export function validatePositions(map) {
  const problems = [];
  for (const [id, record] of map) {
    const position = record.position;
    if (!Array.isArray(position) || position.length !== 2) continue;
    const [lat, lon] = position;
    if (typeof lat !== "number" || typeof lon !== "number") continue;
    if (isOnLand(lat, lon)) {
      problems.push(`${id}: corrected position ${lat}, ${lon} is still on land`);
    }
  }
  return problems;
}

import { isOnLand, isWithinCoverage } from "./coastline.js";

/**
 * Pull a numeric [lat, lon] out of a record's position, or null if it is
 * missing or malformed. Shared by both checks below - validateCorrections
 * and validateRegistry already report a malformed position, so both callers
 * here skip it rather than repeating that complaint.
 */
function numericPosition(record) {
  const position = record.position;
  if (!Array.isArray(position) || position.length !== 2) return null;
  const [lat, lon] = position;
  if (typeof lat !== "number" || typeof lon !== "number") return null;
  return [lat, lon];
}

/**
 * Check that a corrections file's or registry's positions actually land in
 * water. Requires the coastline, so this is kept apart from
 * validateCorrections/validateRegistry - those stay dependency-free for
 * callers (the library entry point included) that never load the coastline.
 *
 * Only checks "is this in water", not distance from the originally
 * published position: neither file carries a published position to compare
 * against (a registry station has none; a correction's map does not either).
 *
 * Malformed positions (wrong shape, non-numeric) are skipped here -
 * validateCorrections/validateRegistry already report those.
 */
export function validatePositions(map) {
  const problems = [];
  for (const [id, record] of map) {
    const numeric = numericPosition(record);
    if (!numeric) continue;
    const [lat, lon] = numeric;
    if (isOnLand(lat, lon)) {
      problems.push(`${id}: position ${lat}, ${lon} is on land`);
    }
  }
  return problems;
}

/**
 * Positions the coastline cannot answer for.
 *
 * Reported separately from `validatePositions` because these are not
 * failures: a gate north of the Salish Sea clip is fine, it just cannot be
 * confirmed here. Silently passing it as water is the defect - the check
 * would be claiming a result it never computed.
 */
export function coverageWarnings(map) {
  const warnings = [];
  for (const [id, record] of map) {
    const numeric = numericPosition(record);
    if (!numeric) continue;
    const [lat, lon] = numeric;
    if (!isWithinCoverage(lat, lon)) {
      warnings.push(`${id}: position ${lat}, ${lon} is outside coastline coverage - cannot be verified`);
    }
  }
  return warnings;
}

/**
 * The same out-of-coverage positions as `coverageWarnings`, worded as
 * failures. Used for the registry, where being outside the clip is a defect,
 * not a note: the registry is stations this package owns and asserts a
 * position for, so one the on-land audit can never reach is a claim the
 * package cannot back. The build clip is derived from the registry's own
 * extent (scripts/build-coastline.mjs), so the fix is to rebuild the
 * coastline. Corrections stay a note - a correction points at an external
 * provider station whose true location the package does not own, so
 * "unconfirmable" there is honest rather than a defect.
 */
export function coverageFailures(map) {
  return coverageWarnings(map).map((w) =>
    w.replace(
      "outside coastline coverage - cannot be verified",
      "outside coastline coverage - a registry station must sit within the bundled coastline so the on-land audit can reach it; rebuild the coastline (scripts/build-coastline.mjs derives the clip from the registry)",
    ),
  );
}

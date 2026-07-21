import { inlandMetres, nearestWater, isWithinCoverage } from "./coastline.js";

/**
 * How far inland a station must be before it is worth reporting.
 *
 * Tide gauges sit on piers, and a chart-derived coastline draws the pier as
 * land: the Friday Harbor gauge measures 31 m inland and is correctly sited.
 * Genuinely misplaced stations are hundreds of metres out. 200 m sits in the
 * gap. Tune it; do not remove it.
 */
export const REPORT_THRESHOLD_M = 200;

/**
 * Report stations whose resolved position is on land, past the threshold.
 *
 * Runs against the *resolved* position, so a station already fixed in the
 * corrections file is not reported again.
 *
 * `nearestWater` throws when no water is mapped within its 20 km search
 * radius (a station stranded deep inland). A batch audit must survive one
 * bad coordinate rather than dying mid-run, so that case is still reported -
 * with `suggestion: null` - instead of propagating.
 */
/**
 * Classify a resolved station the same way `auditStations` would, but as a
 * single verdict rather than a pass/fail list — used by `lock.js` to pin
 * what a station *is*, not just which ones are worth reporting.
 */
/**
 * @returns {{ verdict: "verified" } | { verdict: "unverifiable" } | { verdict: "clear" } | { verdict: "ashore", metresInland: number }}
 */
export function classify(resolved, thresholdM = REPORT_THRESHOLD_M) {
  if (resolved.positionVerified) return { verdict: "verified" };
  // Outside the coastline clip there is no land data, so inlandMetres would
  // return 0 and this would pin a "clear" it never actually checked.
  if (!isWithinCoverage(resolved.latitude, resolved.longitude)) return { verdict: "unverifiable" };
  const metresInland = inlandMetres(resolved.latitude, resolved.longitude);
  if (metresInland <= thresholdM) return { verdict: "clear" };
  return { verdict: "ashore", metresInland };
}

export function auditStations(stations, { resolve, thresholdM = REPORT_THRESHOLD_M } = {}) {
  const findings = [];
  for (const station of stations) {
    const resolved = resolve(station);
    if (resolved.positionVerified) continue;
    const metresInland = inlandMetres(resolved.latitude, resolved.longitude);
    if (metresInland <= thresholdM) continue;

    let suggestion = null;
    try {
      const water = nearestWater(resolved.latitude, resolved.longitude);
      suggestion = { latitude: water.latitude, longitude: water.longitude };
    } catch {
      // ponytail: no mapped water within range - report with no suggestion
      // rather than letting one bad coordinate kill the whole batch.
    }

    findings.push({ id: resolved.id, name: resolved.name, metresInland, suggestion });
  }
  return findings.sort((a, b) => b.metresInland - a.metresInland);
}

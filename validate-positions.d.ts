import type { Corrections, Registry } from "./index.js";

/**
 * Check that a corrections file's or registry's position overrides land in
 * water.
 *
 * A separate subpath because it pulls in the 3.6 MB coastline parse — the
 * package root must stay cheap to import.
 */
export function validatePositions(map: Corrections | Registry): string[];

/**
 * Positions the coastline cannot answer for, from either file.
 *
 * Reported separately from `validatePositions` because these are not
 * failures - a position outside the clip is unconfirmable, not wrong.
 */
export function coverageWarnings(map: Corrections | Registry): string[];

import type { Corrections } from "./index.js";

/**
 * Check that a corrections file's position overrides land in water.
 *
 * A separate subpath because it pulls in the 3.6 MB coastline parse — the
 * package root must stay cheap to import.
 */
export function validatePositions(map: Corrections): string[];

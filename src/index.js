import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createResolver } from "./resolve.js";
import { loadCorrections } from "./corrections.js";

export { createResolver } from "./resolve.js";
export { loadCorrections, validateCorrections } from "./corrections.js";
export { cleanName } from "./clean.js";
export { toSlug } from "./slug.js";
export { buildLock, readLock, diffLock } from "./lock.js";

const bundledPath = (name) => fileURLToPath(new URL(`../data/${name}`, import.meta.url));

/**
 * Build a resolver over the corrections and gazetteer this package ships,
 * resolved relative to the installed package rather than the caller's cwd
 * (a plain `readFileSync("data/corrections.yaml")` breaks once installed,
 * because it resolves against the consumer's directory instead).
 *
 * Deliberately reads only the YAML and the gazetteer, not the coastline -
 * importing this library must never pay for parsing the 3.6 MB coastline;
 * that only happens for audit-related code that asks for it.
 */
export function createBundledResolver() {
  const corrections = loadCorrections(readFileSync(bundledPath("corrections.yaml"), "utf8"));
  const gazetteer = JSON.parse(readFileSync(bundledPath("gazetteer.json"), "utf8"));
  return createResolver({ corrections, gazetteer });
}

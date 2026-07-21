import { parse } from "yaml";
import { namesOverlap } from "./names.js";
import { toSlug } from "./slug.js";

/**
 * Stations whose identity this package owns.
 *
 * Distinct from corrections.yaml, which is an *overlay*: a correction is a
 * delta against something a provider published, so it needs a `reason` and is
 * checked for plausible distance from the published position. A registry
 * entry has no upstream to differ from - it is the record itself. CHS is the
 * first data like this: the name a consumer sees is a hand-written label, and
 * the fitting pipeline emits no position at all.
 *
 * Deliberately imports no coastline: position-in-water checking lives behind
 * ./validate-positions.js so the package root stays cheap.
 */
export function loadRegistry(yamlText) {
  const raw = parse(yamlText) ?? {};
  return new Map(Object.entries(raw));
}

const isString = (v) => typeof v === "string";
const isNonEmptyString = (v) => isString(v) && v.trim() !== "";
const isStringArray = (v) => Array.isArray(v) && v.every(isString);
const isValidPosition = (v) =>
  Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number");

/**
 * Check a registry for the mistakes contributors make.
 *
 * Hand-edited and PR-able like the corrections file, so malformed input is an
 * expected failure mode and must be reported, never thrown.
 *
 * Pass `corrections` to enable the cross-file rules: a station may not be
 * declared in both files (two sources of authority is the bug), and slugs must
 * be unique across both, because URLs share one namespace.
 *
 * `validateAgainstStations` and MAX_CORRECTION_KM are deliberately NOT applied
 * here. Distance-from-published is undefined when the registry *is* the
 * published value. This absence is intentional, not an oversight.
 */
export function validateRegistry(registry, { corrections = new Map() } = {}) {
  const problems = [];
  const slugs = new Map();

  for (const [id, record] of registry) {
    for (const field of ["name", "provider", "providerId"]) {
      if (!isNonEmptyString(record[field])) {
        problems.push(
          record[field] !== undefined && !isString(record[field])
            ? `${id}: ${field} must be a string`
            : `${id}: ${field} is required`,
        );
      }
    }
    for (const field of ["context", "slug"]) {
      if (record[field] !== undefined && !isString(record[field])) {
        problems.push(`${id}: ${field} must be a string`);
      }
    }
    for (const field of ["cities", "aliases"]) {
      if (record[field] !== undefined && !isStringArray(record[field])) {
        problems.push(`${id}: ${field} must be an array of strings`);
      }
    }

    if (record.position === undefined) {
      problems.push(`${id}: position is required`);
    } else if (!isValidPosition(record.position)) {
      problems.push(`${id}: position must be a [latitude, longitude] array of two numbers`);
    } else {
      const [lat, lon] = record.position;
      if (lat < -90 || lat > 90) problems.push(`${id}: latitude ${lat} is out of range`);
      if (lon < -180 || lon > 180) problems.push(`${id}: longitude ${lon} is out of range`);
    }

    if (isString(record.name) && isString(record.context) && namesOverlap(record.name, record.context)) {
      problems.push(`${id}: context repeats the name ("${record.name}" / "${record.context}")`);
    }

    if (record.slug !== undefined && isString(record.slug) && !/^[a-z0-9-]+$/.test(record.slug)) {
      problems.push(`${id}: slug "${record.slug}" must be lowercase letters, digits and hyphens`);
    }

    // ponytail: resolve.js derives a routable slug (override.slug ?? toSlug(name))
    // whenever a record sets none, so an unset slug still ends up live and must
    // be guarded the same as an explicit one. Only compute it when there's a
    // usable name (or an explicit slug already) - a record failing the
    // required-name check has no real name to derive from, and toSlug("undefined")
    // would register a bogus collision target for a problem already reported above.
    const effectiveSlug =
      record.slug !== undefined && isString(record.slug)
        ? record.slug
        : isNonEmptyString(record.name)
          ? toSlug(record.name)
          : undefined;

    if (effectiveSlug !== undefined) {
      if (slugs.has(effectiveSlug)) {
        problems.push(`${id}: duplicate slug "${effectiveSlug}", also used by ${slugs.get(effectiveSlug)}`);
      }
      slugs.set(effectiveSlug, id);
    }

    if (corrections.has(id)) {
      problems.push(`${id}: declared in both the registry and corrections - a station has one source of authority`);
    }
  }

  // Corrections side deliberately checks only the *explicit* slug, not the
  // effective one - the corrections overlay has the identical derived-slug gap
  // (validateCorrections never closes it) and must keep behaving the same
  // after this change. Only the registry side gets effective-slug checking.
  for (const [id, record] of corrections) {
    if (record.slug !== undefined && isString(record.slug) && slugs.has(record.slug)) {
      problems.push(`${id}: slug "${record.slug}" collides with ${slugs.get(record.slug)} in the registry`);
    }
  }

  return problems;
}

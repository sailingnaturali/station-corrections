import { parse } from "yaml";

/**
 * Parse the corrections file into a Map keyed by provider station ID.
 *
 * IDs are opaque strings — `noaa/9447659`, `chs-active-pass`, `PUG1717` — so
 * nothing here may assume a format.
 */
export function loadCorrections(yamlText) {
  const raw = parse(yamlText) ?? {};
  return new Map(Object.entries(raw));
}

/**
 * Check a corrections map for the mistakes contributors actually make.
 * Returns human-readable problems; an empty array means valid.
 */
export function validateCorrections(map) {
  const problems = [];
  const slugs = new Map();

  for (const [id, record] of map) {
    if (record.position) {
      const [lat, lon] = record.position;
      if (!record.reason) {
        problems.push(`${id}: position is corrected but no reason is given`);
      }
      if (typeof lat !== "number" || lat < -90 || lat > 90) {
        problems.push(`${id}: latitude ${lat} is out of range`);
      }
      if (typeof lon !== "number" || lon < -180 || lon > 180) {
        problems.push(`${id}: longitude ${lon} is out of range`);
      }
    }

    if (record.name && record.context) {
      const name = record.name.toLowerCase();
      const context = record.context.toLowerCase();
      if (name === context || context.startsWith(`${name},`) || context === `${name} bay`) {
        problems.push(`${id}: context repeats the name ("${record.name}" / "${record.context}")`);
      }
    }

    if (record.slug) {
      if (!/^[a-z0-9-]+$/.test(record.slug)) {
        problems.push(`${id}: slug "${record.slug}" must be lowercase letters, digits and hyphens`);
      }
      if (slugs.has(record.slug)) {
        problems.push(`${id}: duplicate slug "${record.slug}", also used by ${slugs.get(record.slug)}`);
      }
      slugs.set(record.slug, id);
    }
  }

  return problems;
}

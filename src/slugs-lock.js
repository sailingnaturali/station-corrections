import { toSlug } from "./slug.js";

/**
 * A slug is an API: once shared in a URL, changing it silently breaks the
 * link. CI cannot tell a slug *changed* without knowing what it used to be,
 * so this lock pins the current slug per station - the same problem
 * audit.lock.json solves for position/verdict, applied to slugs instead.
 *
 * Only the slug each station currently resolves to is knowable from
 * corrections.yaml/registry.yaml alone, so this mirrors the split
 * validateCorrections/validateRegistry already keep: a registry entry always
 * has a name, so its *effective* slug (explicit or derived) is trustworthy;
 * a corrections entry may have neither, relying on the provider's raw name -
 * unknowable without a stations file - so only its *explicit* slug counts.
 * That gap is the same one validateRegistry's cross-file check leaves open,
 * not a new one introduced here.
 */
function currentSlugs(corrections, registry) {
  const slugs = new Map();
  for (const [id, record] of corrections) {
    if (typeof record.slug === "string") slugs.set(id, record.slug);
  }
  for (const [id, record] of registry) {
    const slug =
      typeof record.slug === "string"
        ? record.slug
        : typeof record.name === "string" && record.name.trim() !== ""
          ? toSlug(record.name)
          : undefined;
    if (slug !== undefined) slugs.set(id, slug);
  }
  return slugs;
}

/** Build the slugs lock from the current corrections and registry data. */
export function buildSlugsLock(corrections, registry) {
  return {
    note:
      "Current slug per station, so a change can be detected without re-reading git history. `station-corrections check-slugs` fails when a slug moved without the old value recorded in formerSlugs. Regenerate with `station-corrections slugs`.",
    generated: new Date().toISOString().slice(0, 10),
    slugs: Object.fromEntries(currentSlugs(corrections, registry)),
  };
}

/** Parse a slugs lock from its on-disk JSON string. No validation beyond JSON.parse - the lock is a build artifact, not hand-edited input. */
export function readSlugsLock(json) {
  return JSON.parse(json);
}

/**
 * Compare a slugs lock against the current corrections and registry data.
 *
 * Fails only on the one thing that needs history to detect: a station's slug
 * differing from the lock without the old value recorded in `formerSlugs`.
 * The static checks that don't need history - malformed formerSlugs entries,
 * a slug colliding with any station's formerSlugs - live in
 * validateCorrections/validateRegistry instead, alongside the existing
 * current-slug collision check they already perform.
 *
 * A station absent from the current data (removed) or absent from the lock
 * (new) is not this check's concern - nothing "changed" for either.
 */
export function checkSlugs(lock, corrections, registry) {
  const problems = [];
  const current = currentSlugs(corrections, registry);

  for (const [id, lockedSlug] of Object.entries(lock.slugs)) {
    const nowSlug = current.get(id);
    if (nowSlug === undefined || nowSlug === lockedSlug) continue;

    const record = corrections.get(id) ?? registry.get(id);
    const formerSlugs = record && Array.isArray(record.formerSlugs) ? record.formerSlugs : [];
    if (!formerSlugs.includes(lockedSlug)) {
      problems.push(
        `${id}: slug changed from "${lockedSlug}" to "${nowSlug}" without recording "${lockedSlug}" in formerSlugs`,
      );
    }
  }

  return problems;
}

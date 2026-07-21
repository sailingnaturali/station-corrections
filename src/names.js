function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePhrase(text) {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * True when one of name/context contains the other as a whole-word phrase
 * (case-insensitive) — "Everett" inside "Port of Everett", "Union" inside
 * "Union Bay" — but not when the match is only a substring of a longer word
 * ("Union" inside "Reunion Island") or when two phrases merely share a word
 * ("Port Townsend" vs "Port Angeles").
 *
 * Lives here rather than in corrections.js, which is where it reads like it
 * belongs, for a bundle-size reason worth stating: resolve.js needs it, and
 * corrections.js top-level imports the `yaml` parser. `yaml` does not declare
 * itself side-effect-free, so a bundler will not drop it — importing this
 * helper from there dragged ~30 KB of YAML parser into every browser bundle
 * that only ever called createBundledResolver. Keeping it in a leaf module
 * with no dependencies means the browser path never touches corrections.js.
 */
export function namesOverlap(name, context) {
  const normName = normalizePhrase(name);
  const normContext = normalizePhrase(context);
  const namePattern = new RegExp(`\\b${escapeRegExp(normName)}\\b`);
  const contextPattern = new RegExp(`\\b${escapeRegExp(normContext)}\\b`);
  return namePattern.test(normContext) || contextPattern.test(normName);
}

/**
 * Generic geographic and function words common enough that two unrelated
 * stations sharing one of them proves nothing - "Point" is in a third of
 * this dataset's names. Excluded so `sharesMeaningfulWord` only fires on a
 * word distinctive enough to mean two names are about the same place.
 */
const STOP_WORDS = new Set([
  "the", "a", "an", "of", "and",
  "bay", "point", "island", "channel", "inlet", "harbor", "harbour",
  "sound", "strait", "passage", "narrows", "cove", "creek", "river",
  "entrance", "ent", "st", "pt",
]);

function meaningfulWords(text) {
  return normalizePhrase(text)
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !STOP_WORDS.has(word));
}

/**
 * True when name and otherName share at least one word that isn't a generic
 * stop word. Catches a curated `name` that describes a completely different
 * place than the station it's attached to - issue #6, where `name: Anacortes`
 * was pinned onto a Swinomish Channel gauge and the two names share nothing
 * once "Channel" and "Bay" are set aside as noise.
 */
export function sharesMeaningfulWord(name, otherName) {
  const words = meaningfulWords(name);
  const otherWords = new Set(meaningfulWords(otherName));
  return words.some((word) => otherWords.has(word));
}

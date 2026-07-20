/** Words that stay lowercase inside a name, but not at the start. */
const MINOR = new Set(["of", "the", "at", "on", "in", "and", "de", "la", "el"]);

/** Tokens whose capitalisation is already correct and must survive title-casing. */
const KEEP = new Set(["US", "BC", "NE", "NW", "SE", "SW", "USCG"]);

/** Abbreviations worth spelling out. Deliberately short — only the noisy ones. */
const EXPAND = [
  [/\bNAS\b/g, "Naval Air Station"],
  [/\bSt\. Park\b/gi, "State Park"],
  [/\bent\./gi, "Entrance"],
  [/\bI\.(?=$|,)/g, "Island"],
  [/\bIs\./gi, "Islands"],
  [/\bPt\./gi, "Point"],
  [/\bCk\./gi, "Creek"],
];

function titleCaseWord(word, first) {
  const bare = word.replace(/[^A-Za-z]/g, "");
  if (KEEP.has(bare.toUpperCase())) return word;
  const lower = word.toLowerCase();
  if (!first && MINOR.has(lower)) return lower;
  // Hyphens, slashes, and apostrophes each start a new capital: "spee-bi-dah", "o'brien".
  return lower.replace(/(^|[-/('’])([a-z])/g, (_, lead, letter) => lead + letter.toUpperCase());
}

/**
 * Clean a provider's station name.
 *
 * Only ALL-CAPS runs are re-cased. Mixed-case names were written by a human and
 * may contain capitalisation we cannot reconstruct — re-casing those breaks more
 * than it fixes.
 */
export function cleanName(raw) {
  let name = String(raw).trim().replace(/\s+/g, " ");
  for (const [pattern, replacement] of EXPAND) name = name.replace(pattern, replacement);
  return name
    .split(" ")
    .map((word, index) => {
      const letters = word.replace(/[^A-Za-z]/g, "");
      const shouting = letters.length > 1 && letters === letters.toUpperCase();
      return shouting ? titleCaseWord(word, index === 0) : word;
    })
    .join(" ");
}

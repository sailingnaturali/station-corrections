import { cleanName } from "./clean.js";
import { toSlug } from "./slug.js";
import { namesOverlap } from "./corrections.js";

/** Great-circle distance in kilometres. */
function distanceKm(aLat, aLon, bLat, bLon) {
  const toRad = Math.PI / 180;
  const dLat = (bLat - aLat) * toRad;
  const dLon = (bLon - aLon) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/**
 * Split a cleaned name on NOAA's comma-qualifier convention: "Friday Harbor,
 * San Juan Island" is the place, then where it is. Later segments (Bremerton
 * often carries two) join with a middot rather than being discarded.
 *
 * "Puget Sound" is dropped rather than kept as context - it is true of nearly
 * everything this package covers and tells a local nothing.
 */
function splitQualifier(cleaned) {
  const [primary, ...rest] = cleaned.split(",").map((part) => part.trim());
  const context = rest
    .filter(Boolean)
    .filter((part) => part.toLowerCase() !== "puget sound")
    .join(" · ");
  return { primary, context };
}

/**
 * Build a resolver over a corrections map and a gazetteer.
 *
 * Resolution order, highest first:
 *   1. curated override — anything in the corrections file wins
 *   2. source data — the provider's own name, cleaned and, if it carries a
 *      comma qualifier, split into a name and a context
 *   3. derived fallback — nearest gazetteer place, so context is never empty
 */
export function createResolver({ corrections = new Map(), gazetteer = [] } = {}) {
  return function resolve(station) {
    const override = corrections.get(station.id) ?? {};
    const split = splitQualifier(cleanName(station.name));
    const name = override.name ?? split.primary;
    const slug = override.slug ?? toSlug(name);

    // A context that restates the name tells the reader nothing - true whether
    // it comes from the raw name's own qualifier or from a nearest-town
    // derivation. Same rule validateCorrections applies to a human-written
    // context, so "Everett Marina" suppresses "near Everett, WA" too, not just
    // an exact match.
    let context = override.context ?? "";
    let derived = false;
    if (!context && split.context && !namesOverlap(name, split.context)) {
      context = split.context;
    }
    if (!context) {
      const nearest = nearestPlace(station, gazetteer);
      if (nearest && !namesOverlap(name, nearest.name)) {
        context = `near ${nearest.name}, ${nearest.region}`;
        derived = true;
      }
    }

    const position = override.position ?? [station.latitude, station.longitude];

    const aliases = new Set([
      name.toLowerCase(),
      slug,
      ...(override.aliases ?? []).filter((a) => typeof a === "string").map((a) => a.toLowerCase()),
    ]);

    const result = {
      id: station.id,
      name,
      context,
      slug,
      cities: override.cities ?? [],
      aliases: [...aliases],
      latitude: position[0],
      longitude: position[1],
      corrected: Boolean(override.position),
      derived,
    };
    // Only present when the correction sets it - an always-there
    // `positionVerified: undefined` key is an output no one asked for.
    if (override.positionVerified !== undefined) result.positionVerified = override.positionVerified;
    return result;
  };
}

function nearestPlace(station, gazetteer) {
  let best = null;
  let bestKm = Infinity;
  for (const place of gazetteer) {
    const km = distanceKm(station.latitude, station.longitude, place.latitude, place.longitude);
    if (km < bestKm) {
      bestKm = km;
      best = place;
    }
  }
  return best;
}

import { cleanName } from "./clean.js";
import { toSlug } from "./slug.js";

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
 * Build a resolver over a corrections map and a gazetteer.
 *
 * Resolution order, highest first:
 *   1. curated override — anything in the corrections file wins
 *   2. derived fallback — nearest gazetteer place, so context is never empty
 *   3. source data — the provider's own name, cleaned
 */
export function createResolver({ corrections = new Map(), gazetteer = [] } = {}) {
  return function resolve(station) {
    const override = corrections.get(station.id) ?? {};
    const name = override.name ?? cleanName(station.name);
    const slug = override.slug ?? toSlug(name);

    let context = override.context ?? "";
    let derived = false;
    if (!context) {
      const nearest = nearestPlace(station, gazetteer);
      // A context that restates the name tells the reader nothing, and is what
      // a nearest-town derivation produces at a station named for its town.
      if (nearest && nearest.name.toLowerCase() !== name.toLowerCase()) {
        context = `near ${nearest.name}, ${nearest.region}`;
        derived = true;
      }
    }

    const position = override.position ?? [station.latitude, station.longitude];

    const aliases = new Set([
      name.toLowerCase(),
      slug,
      ...(override.aliases ?? []).map((a) => a.toLowerCase()),
    ]);

    return {
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
      positionVerified: override.positionVerified,
    };
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

/**
 * Great-circle distance in kilometres.
 *
 * A leaf module because both callers - resolve.js and corrections.js - need
 * it, and neither should import the other: corrections.js pulls in the `yaml`
 * parser, resolve.js pulls in the whole resolver, and each would drag the
 * other's weight into bundles that only wanted one of them.
 */
export function distanceKm(aLat, aLon, bLat, bLon) {
  const toRad = Math.PI / 180;
  const dLat = (bLat - aLat) * toRad;
  const dLon = (bLon - aLon) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

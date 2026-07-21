# station-corrections

**Everything the agencies got wrong about tide and current stations, in one reviewable file.**

Published station data is a survey artifact, not a product. Names arrive shouting (`CHERRY POINT`)
or trailing qualifiers (`Swinomish Channel ent., Padilla Bay`). Many carry no context at all, so
a list of them reads half-broken. And some positions land on dry ground — the complaint that
dogs every marine app in these waters.

This package maps a station ID to what a person would actually say, plus a position that is
actually in the water.

```bash
npm install @sailingnaturali/station-corrections
```

```js
import { createBundledResolver } from "@sailingnaturali/station-corrections";

const resolve = createBundledResolver();

resolve({ id: "noaa/9447659", name: "Everett", latitude: 47.98, longitude: -122.223 });
// {
//   name: "Everett",
//   context: "Port Gardner",     ← curated; the published data has none
//   slug: "everett",
//   cities: ["Everett", "Marysville"],
//   aliases: ["everett", "port gardner", "everett marina"],
//   latitude: 47.98, longitude: -122.223,
//   corrected: false, derived: false,
// }
```

It is provider-agnostic: `noaa/9447659`, `chs-active-pass` and `PUG1717` all resolve through the
same overlay, so tides, currents and both countries share one vocabulary.

To resolve against your own corrections or gazetteer instead of the bundled ones, use
`createResolver({ corrections, gazetteer })` directly with `loadCorrections`. Advanced consumers
that need the raw shipped files can reach them via the `./data/*` export subpath, e.g.
`import("@sailingnaturali/station-corrections/data/corrections.yaml")` with an import attribute,
or `createRequire(import.meta.url).resolve(...)` to get a filesystem path.

Checking that a corrected `position` actually lands in water (`validatePositions`) is exposed the
same opt-in way, via `import { validatePositions } from "@sailingnaturali/station-corrections/validate-positions"`
— it is not re-exported from the package root because it pulls in the 3.6 MB coastline parse, and
the root import must stay cheap. A consumer validating their own corrections file, the same way the
CLI's `validate` command does, imports this subpath directly.

## Three tiers

Every lookup resolves highest-first:

1. **Curated override** — anything in `data/corrections.yaml` wins outright.
2. **Derived fallback** — nearest place from the bundled gazetteer, so context is never empty
   and new coverage needs no hand-work. Flagged `derived: true`.
3. **Source data** — the provider's own name, cleaned.

Cleaning only re-cases names that are **entirely** upper case. Mixed-case names were typed by a
human and may carry capitalisation we cannot reconstruct — `Spee-Bi-Dah`, `La Push`, `McArthur`
pass through untouched. Abbreviations that read badly are expanded: `NAS` → Naval Air Station,
`ent.` → Entrance, `St. Park` → State Park.

## The corrections file

```yaml
noaa/9447659:
  name: Everett
  context: Port Gardner
  slug: everett
  cities: [Everett, Marysville]
  aliases: [port gardner, everett marina]

noaa/9442396:
  name: La Push
  context: Quillayute River
  positionVerified: >-
    Sited up the Quillayute River. The coastline maps ocean only, so a riverine
    gauge reads inland by construction — the published position is correct.
```

| Field | Meaning |
|---|---|
| `name` / `context` | The two-line display. Context is whatever most usefully distinguishes the place — a water body, island group, region, county, or characteristic. |
| `slug` | Canonical URL segment. Lives here so a name fix and its URL move together. |
| `cities` | Nearest settlements, for search. Not for display. |
| `aliases` | What someone might type. Local names, former names, misspellings. |
| `position` | A corrected `[lat, lon]`. Requires `reason`. |
| `positionVerified` | A reason the published position is *right* despite reading inland. Mutually exclusive with `position`. Passed straight through to the resolved object when set, and omitted from it otherwise. |

**Context must never restate the name.** `Everett · Everett` is what a nearest-town derivation
produces at a station named for its town, and it tells the reader nothing. Validation rejects a
context containing the full station name as a whole-word phrase, so `Everett Harbor` and
`Port of Everett` are refused — while `Port Townsend` / `Port Angeles`, different places sharing
a word, passes.

## Finding stations that are on land

```bash
npx station-corrections audit stations.json
npx station-corrections validate
```

The audit tests every resolved position against a bundled coastline and reports those more than
**200 m** inland, with a suggested nearest-water point. It reports and suggests; **it never
edits.** Nearest water is frequently the wrong side of a spit or the wrong bay, so a human picks
the real spot and writes the reason.

That threshold is not arbitrary. Two categories read as inland and are perfectly correct:

- **Pier-mounted gauges.** Almost all of them — you need a structure over water. A chart-derived
  coastline draws the pier as land. The Friday Harbor gauge measures 31 m inland and is right.
- **Riverine stations.** The coastline product maps the *ocean*, so a gauge up a river reads
  inland by construction.

A genuinely misplaced station is hundreds of metres out. 200 m sits in the gap. Known-good cases
get a `positionVerified` reason and the audit stops reporting them — an audit that never reaches
zero is one nobody reads.

## Pinning results with a lock

```bash
npx station-corrections lock stations.json    # writes data/audit.lock.json
npx station-corrections check stations.json   # exit 1 if a station has moved since the lock
```

`lock` pins every station's *resolved* position and audit verdict (`clear`, `verified`, or
`ashore`) against the bundled coastline. The point isn't speed — it's change detection: NOAA can
silently move a gauge, and without a lock that only shows up as a surprise months later. With one
committed, `check` (the CI guard) turns it into a line in a diff the moment it happens. Because
the lock pins the *resolved* position, a human editing `corrections.yaml` shows up as "moved"
too — that's a data change worth reviewing, not a false alarm. `audit` reuses a pinned verdict
for any station whose resolved position and the lock's coastline/threshold all still match,
reporting how many were cached versus freshly checked.

## Contributing a correction

Corrections are pull requests, and CI checks them mechanically: schema validity, `reason`
present whenever `position` is, unique slugs, no context that restates its name, and that a
corrected `position` actually lands in water against the bundled coastline.

If a station looks wrong in an app built on this, a one-line PR fixes it for everyone.

## Data and licences

- **Coastline** — [OSM land polygons](https://osmdata.openstreetmap.de/data/land-polygons.html),
  ODbL, clipped to the Salish Sea. Natural Earth 1:10m was measured and rejected: it reads the
  Anacortes area as water and Friday Harbor as land, generalising the San Juans away entirely.
- **Corrections and gazetteer** — hand-written here, MIT with the package.

Rebuild the coastline with `node scripts/build-coastline.mjs <shapefile-dir> data/coastline.geojson`
(needs GDAL). The golden-point tests in `src/coastline.test.js` are the acceptance criterion for
the data — if one fails, fix the data, not the test.

## Develop

```bash
npm install
npm test
```

---

MIT. Part of [Sailing Naturali](https://sailingnaturali.com).

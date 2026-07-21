# Station registry: making station-corrections the source of truth for station identity

**Date:** 2026-07-21
**Status:** Approved, not yet implemented
**Scope:** Phase 1 of 4 — `station-corrections` only

## Problem

CHS tidal-current station identity — the tuple of *stable id*, *human name*, and *position* —
is currently curated in three physical places, none of which is authoritative:

```
currents-vault/passes/*.md          name, station_id, latitude, longitude, hazards
  └─ vendored into ──> currents-mcp/src/currents_mcp/_vault/passes/   (20 files)
                          └─ passages.py reads station_id, latitude, longitude

chs-constituents/stations/salish-sea.json    id (IWLS uuid), label
  └─ pipeline.ts derives:  id = "chs-" + slug(label),  name = label
```

All 19 CHS stations in the fitting pipeline have a 1:1 counterpart in `currents-vault`. The
twentieth vault entry, Boundary Pass, is a NOAA station (`PUG1717`). Nothing reconciles these
copies, and nothing would fail if they diverged.

Adding CHS entries to `corrections.yaml` in the obvious way would make a fourth copy. The
decision recorded here is to invert that: station-corrections becomes the single home for
station identity, and the vault and the pipeline become consumers.

### Why CHS cannot use the existing overlay model

`corrections.yaml` is an **overlay**. A record expresses a *delta* against data a provider
published: `position` means "the provider was wrong", it requires `reason`, it is validated as
within `MAX_CORRECTION_KM` of the published position, and it sets `corrected: true` on the
resolved output.

CHS has no upstream authority to overlay onto:

- The `name` a consumer sees is not a CHS-published name. `chs-constituents/src/pipeline.ts:98`
  sets `name: station.label` — the hand-written label from `stations/salish-sea.json`. There is
  no shouting to fix and no comma qualifier to split; the name-cleaning half of this package is
  a no-op for CHS.
- The pipeline's output carries **no position at all** (`currents.schema.json` requires only
  `id`, `name`, `type`, `floodDirection`, `ebbDirection`, `offset`, `constituents`). Position
  lives solely in the vault today.

So for CHS the data is not a correction of anything. It is the record itself. Conflating the two
models would make `validateAgainstStations` meaningless, make `corrected: true` a lie, and turn
"reason is required with position" into a conditional branch — the class of subtle mode-switch
that produced issue #6.

## Non-goals

- **No CHS-derived data is bundled.** The registry holds ids and metadata written here. It does
  not carry constituents, predictions, or a CHS-published station list. This matches what the
  package already does for NOAA: no provider station list is shipped for any provider.
- **No changes to the overlay.** `corrections.yaml` semantics, `validateCorrections`,
  `validateAgainstStations` and `MAX_CORRECTION_KM` are untouched.
- **Phases 2–4 are out of scope.** Consumers keep working from their own copies until migrated.

## Schema — `data/stations.yaml`

Keyed by the stable public identifier, which is what `chs-constituents` already emits
(`"chs-" + slug(label)`):

```yaml
chs-dodd-narrows:
  name: Dodd Narrows
  context: Nanaimo
  position: [49.1344, -123.8171]
  provider: chs
  providerId: 63aef1866a2b9417c035030f
  cities: [Nanaimo]
  aliases: [dodd]
```

| Field | Required | Meaning |
|---|---|---|
| `name` | yes | Display name. The record, not a correction of one. |
| `position` | yes | Canonical `[latitude, longitude]`. No `reason` — nothing is being corrected. |
| `provider` | yes | Source system, e.g. `chs`. Opaque string. |
| `providerId` | yes | The provider's own identifier, e.g. the IWLS uuid. |
| `context` | no | Same rules as the overlay: must not restate the name. |
| `slug` | no | Derived from `name` when absent. |
| `cities` | no | Nearest settlements, for search. |
| `aliases` | no | Alternate search terms. |

`providerId` is deliberately distinct from the key. `chs-dodd-narrows` is stable, readable, and
safe in a URL; `63aef1866a2b9417c035030f` is an opaque API handle. Keeping them separate stops
the API identifier leaking into routes and lets a provider reissue ids without breaking links.

## Resolution

Precedence becomes three tiers, highest first:

1. **Registry** (`stations.yaml`) — authoritative identity. Wins outright.
2. **Corrections** (`corrections.yaml`) — overlay on provider data.
3. **Provider data** — the station object the caller passed.

`resolve({ id: "chs-dodd-narrows" })` returns full identity with no name or position supplied by
the caller — the registry provides both. `resolve({ id, name, latitude, longitude })` for a NOAA
station behaves exactly as it does today.

This is what closes the CHS gap: because `currents.json` has no position, a consumer today needs
a second lookup against the vault. With the registry, one call resolves identity and position.

A registry station resolves with `corrected: false` and `derived: false`. Both are accurate — the
position was not corrected, and the context was curated rather than derived from the gazetteer —
so no new field is added to the resolved shape.

**An id present in both files is a validation error**, not a merge. Two sources of authority for
one station is the defect, not a feature to support.

### API

```js
loadStations(yamlText) -> Map<string, RegistryStation>
validateStations(stations, { corrections }) -> string[]
createResolver({ corrections, gazetteer, stations }) -> resolve
createBundledResolver() -> resolve            // picks up the bundled registry automatically
```

`stations` is optional on `createResolver`, so existing callers are unaffected. `corrections` is
optional on `validateStations`; when supplied, the cross-file rules run.

## Validation — `validateStations`

Intra-file rules:

- `name`, `provider`, `providerId` present and non-empty strings
- `position` present and a valid `[lat, lon]` pair, both in range
- `context`, `slug` string-typed when present; `cities`, `aliases` arrays of strings
- `slug` matches `^[a-z0-9-]+$`
- `context` does not restate `name` (reuses `namesOverlap`)

Cross-file rules, when `corrections` is supplied:

- no id appears in both files
- no slug collides across both files — URLs share one namespace, so uniqueness must be global

Coastline rule, via the existing opt-in subpath:

- every registry `position` lands in water (reuses `validatePositions`)

### Coastline coverage — a latent bug this work exposes

The bundled coastline is clipped to lat `47.000..50.500`, lon `-125.500..-122.000`. Three of the
nineteen gates fall outside it:

| Station | Position |
|---|---|
| Blackney Passage | 50.555, -126.684 |
| Johnstone Strait — Central | 50.472, -126.137 |
| Weynton Passage | 50.603, -126.812 |

Outside the clip there are no land polygons, so `isOnLand` returns `false` and `inlandMetres`
returns `0`. Measured, not assumed:

```
Weynton Passage (outside)     onLand=false  inlandMetres=0
Dodd Narrows    (inside)      onLand=false  inlandMetres=0
Mount Vernon    (inside, dry) onLand=true   inlandMetres=13103
```

An out-of-coverage position is therefore indistinguishable from verified open water. A coordinate
anywhere in the Broughtons — or a typo putting a station in Alberta — validates clean.

This is not a registry-specific problem. `validatePositions` and `auditStations` share the same
blind spot for `corrections.yaml` today; it has simply never bitten, because every NOAA
correction happens to sit inside the clip. The registry is the first data to fall outside it.

**The fix belongs in `coastline.js`, where every caller routes through**, not in the registry
validator:

- add a coverage test derived from the coastline's own bounds, not a hardcoded box
- `validatePositions` and `validateStations` report an out-of-coverage position as
  *unverifiable*, distinct from both "in water" and "on land"
- `auditStations` / `classify` gain a matching verdict so the audit and lock stop recording a
  vacuous `clear` for a position they never actually checked

Unverifiable is a reportable state, not a failure: the three northern gates are genuinely fine,
they just cannot be confirmed against this coastline. Silently passing them is the defect.

**Deliberately not applied:** `validateAgainstStations` and `MAX_CORRECTION_KM`. Distance-from-
published is undefined when the registry *is* the published value. This is recorded so a future
reader does not mistake the absence for an oversight and wire it up.

## Build and cross-language access

`scripts/build-corrections-json.mjs` generalizes to compile both YAML sources to JSON. `npm run
build:data` builds both; `check:data` diffs both, so CI still fails when a hand-edited YAML and
its committed artifact drift apart.

`data/stations.json` ships through the existing `./data/*` export subpath. Python reads it
directly with no npm involvement — this is the mechanism that makes the registry usable by
`currents-mcp` in Phase 4, and it mirrors how the vault is vendored today.

## Seeding

The 19 CHS stations are generated from `currents-vault` pass frontmatter (`name`, `station_id`,
`latitude`, `longitude`), cross-checked against `chs-constituents/stations/salish-sea.json` for
id and label agreement, and verified to round-trip before commit.

Hand-transcribing 19 coordinate pairs and uuids is how issue #6 happens. The seed script is
one-time tooling and is not kept in the repo.

`context`, `cities` and `aliases` are written by hand per station — they are the editorial value
this package adds, and no existing source has them.

## Testing

- `validateStations`: each rule, positive and negative
- cross-file: id in both files rejected; slug collision across files rejected
- resolution: registry wins over corrections and over provider data; `resolve({id})` with no
  other fields returns full identity; NOAA overlay behaviour unchanged
- all 19 seeded stations resolve with a name, a context and a position
- every registry position is either confirmed in water or reported as outside coastline coverage
  — with the three northern gates asserted as *unverifiable* rather than *clear*, so a future
  coastline that covers them changes a test result visibly
- a position far outside coverage (an obviously wrong coordinate) is reported, not passed
- `index.d.ts` covers the new exports, checked by both existing guards (tsc over
  `types/surface.ts`, and the runtime declaration-completeness test)
- `browser-safe.test.js` still passes: `stations.json` is a JSON import, reaching no Node builtin

## Deferred

- **No `source` field** on resolved output. `corrected: false, derived: false` already describes a
  registry station accurately.
- **Phase 4 vendoring mechanism** for getting `stations.json` into `currents-mcp` is not designed
  here.
- **NOAA stations stay in the overlay.** Migrating them into the registry would mean bundling a
  provider station list, which this package deliberately does not do.
- **Widening the coastline north** to cover Johnstone Strait and the Broughtons is *not* part of
  this work. It is a data rebuild (`scripts/build-coastline.mjs`, needs GDAL) and issue #2 already
  records that a coastline wider than the Salish Sea clip makes `inlandMetres`' linear scan hurt.
  Reporting those three positions as unverifiable is the honest small step; widening coverage is a
  separate decision with a known performance cost attached.

## Follow-on, unrelated to this work

`chs-constituents/README.md:22` states the IWLS licence is a bespoke Crown licence and explicitly
not the Open Government Licence. `currents-vault/manifest.yaml:10` labels the same API as
"Open Government Licence – Canada". Both cannot be right, and `currents-vault` is public. This
does not gate the registry — which ships only ids and metadata written here — but it should be
settled separately.

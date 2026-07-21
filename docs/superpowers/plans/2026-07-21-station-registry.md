# Station Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `station-corrections` the source of truth for station identity by adding a registry — stations whose name and position this package owns rather than corrects — seeded with the 19 CHS tidal-current gates.

**Architecture:** A second data file (`data/registry.yaml` → `registry.json`) with its own schema and validator, sitting *above* the existing corrections overlay in resolution precedence. The overlay is untouched. Along the way, a latent bug is fixed at its root in `coastline.js`: positions outside the clipped coastline currently validate as verified open water.

**Tech Stack:** Node 22+, ESM, `node --test`, `yaml`, `@turf/boolean-point-in-polygon`, TypeScript for declaration checking only.

## Global Constraints

- **Registry data is written here, not imported from a provider.** No CHS constituents, predictions, or provider station lists are bundled. Ids and metadata only.
- **The overlay is untouched.** `corrections.yaml` semantics, `validateCorrections`, `validateAgainstStations` and `MAX_CORRECTION_KM` must behave identically after this work.
- **`data/audit.lock.json` must remain byte-identical.** All 41 locked stations sit inside coastline coverage, so no verdict may change. `station-corrections check` is the proof.
- **The package root must reach no Node builtin.** `src/browser-safe.test.js` enforces this; `registry.json` must be a JSON import attribute, never `readFileSync`.
- **Every runtime export from `index.js` must be declared in `index.d.ts`.** Two guards enforce this: `tsc` over `types/surface.ts`, and the completeness test in `src/public-surface.test.js`.
- **YAML is the source of truth; JSON is a committed artifact.** `npm run check:data` must fail when they drift.

### Naming decisions that deviate from the spec

The spec proposed `data/stations.yaml`, `loadStations`, `validateStations`. All three collide with existing concepts and are renamed:

| Spec | Used here | Why |
|---|---|---|
| `data/stations.yaml` | `data/registry.yaml` | The CLI already takes `stations.json` meaning *the provider's station list* (`station-corrections validate stations.json`). Two different `stations.json` would be a trap. |
| `loadStations` | `loadRegistry` | `bin/station-corrections.mjs:24` already has a private `loadStations(command, path)` reading a provider list. |
| `validateStations` | `validateRegistry` | One character from `validateAgainstStations`, which does something unrelated. |

---

## File Structure

| File | Responsibility |
|---|---|
| `src/registry.js` | **Create.** `loadRegistry`, `validateRegistry`. Registry schema + cross-file rules. No coastline import. |
| `src/coastline.js` | **Modify.** Add `coverageBounds`, `isWithinCoverage`. |
| `src/validate-positions.js` | **Modify.** Add `coverageWarnings`. `validatePositions` signature unchanged. |
| `src/audit.js` | **Modify.** `classify` returns `unverifiable` outside coverage. |
| `src/resolve.js` | **Modify.** Registry tier above corrections. |
| `src/index.js` | **Modify.** Export registry API; `createBundledResolver` reads bundled registry. |
| `scripts/build-data.mjs` | **Create** (replaces `build-corrections-json.mjs`). Compiles both YAML sources. |
| `data/registry.yaml` | **Create.** 19 seeded CHS stations. |
| `data/registry.json` | **Create.** Generated artifact. |
| `index.d.ts` | **Modify.** `RegistryStation`, `Registry`, new function declarations. |
| `types/surface.ts` | **Modify.** Consumer-shaped usage of the new exports. |
| `bin/station-corrections.mjs` | **Modify.** Validate the registry; rename private `loadStations` → `readStationsFile`. |
| `.github/workflows/ci.yml` | **Modify.** No new step needed — `validate` covers it. |
| `README.md` | **Modify.** Document the registry. |

---

### Task 1: Coastline coverage bounds

The bundled coastline is clipped to a rectangle (`scripts/build-coastline.mjs:23`, `BBOX = [-125.5, 47.0, -122.0, 50.5]`). Outside it there are no land polygons, so `isOnLand` returns `false` and `inlandMetres` returns `0` — a position in Alberta reads as verified open water. Bounds are derived from the data, not hardcoded, so rebuilding the coastline with a wider clip updates them automatically.

**Files:**
- Modify: `src/coastline.js`
- Test: `src/coastline.test.js`

**Interfaces:**
- Produces: `coverageBounds() -> {minLat, maxLat, minLon, maxLon}`, `isWithinCoverage(lat, lon) -> boolean`

- [ ] **Step 1: Write the failing test**

Append to `src/coastline.test.js`:

```js
test("coverage bounds are derived from the coastline data", () => {
  const b = coverageBounds();
  // scripts/build-coastline.mjs clips to [-125.5, 47.0, -122.0, 50.5].
  assert.ok(Math.abs(b.minLat - 47.0) < 0.01, `minLat was ${b.minLat}`);
  assert.ok(Math.abs(b.maxLat - 50.5) < 0.01, `maxLat was ${b.maxLat}`);
  assert.ok(Math.abs(b.minLon - -125.5) < 0.01, `minLon was ${b.minLon}`);
  assert.ok(Math.abs(b.maxLon - -122.0) < 0.01, `maxLon was ${b.maxLon}`);
});

test("positions outside the clip are not covered", () => {
  // Weynton Passage - a real CHS gate north of the Salish Sea clip.
  assert.equal(isWithinCoverage(50.6033, -126.8117), false);
  // Dodd Narrows - inside.
  assert.equal(isWithinCoverage(49.1344, -123.8171), true);
});

test("an uncovered position is not silently reported as water", () => {
  // This is the bug: isOnLand cannot tell "no land here" from "no data here".
  assert.equal(isOnLand(50.6033, -126.8117), false);
  assert.equal(isWithinCoverage(50.6033, -126.8117), false);
});
```

Add `coverageBounds, isWithinCoverage` to the existing import from `./coastline.js` at the top of the file.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/coastline.test.js`
Expected: FAIL — `coverageBounds is not a function`

- [ ] **Step 3: Write minimal implementation**

Add to `src/coastline.js` after the `isOnLand` function:

```js
let bounds = null;

/**
 * The rectangle the bundled coastline actually covers.
 *
 * Derived from the data rather than hardcoded, so rebuilding the coastline
 * with a different clip (scripts/build-coastline.mjs) updates this for free.
 * Computed once on first use: callers that never ask about coverage do not
 * pay for the walk over every coordinate.
 */
export function coverageBounds() {
  if (bounds) return bounds;
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  const walk = (coords) => {
    if (typeof coords[0] === "number") {
      const [lon, lat] = coords;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      return;
    }
    for (const part of coords) walk(part);
  };
  for (const feature of coastline.features) walk(feature.geometry.coordinates);
  bounds = { minLat, maxLat, minLon, maxLon };
  return bounds;
}

/**
 * Is this position somewhere the coastline can actually answer for?
 *
 * Outside the clip there are no land polygons, so `isOnLand` returns false
 * and `inlandMetres` returns 0 - indistinguishable from verified open water.
 * Every caller that treats "not on land" as "in water" must check this first,
 * or it is reporting a result it never computed.
 */
export function isWithinCoverage(lat, lon) {
  const b = coverageBounds();
  return lat >= b.minLat && lat <= b.maxLat && lon >= b.minLon && lon <= b.maxLon;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/coastline.test.js`
Expected: PASS, all tests including the pre-existing golden-point tests

- [ ] **Step 5: Commit**

```bash
git add src/coastline.js src/coastline.test.js
git commit -m "Derive coastline coverage bounds, so 'no data' stops reading as 'water'"
```

---

### Task 2: Report uncovered positions instead of passing them

`validatePositions` keeps its signature and meaning — problems are failures. Uncovered positions are a separate, non-failing report, because the three northern gates are genuinely fine and just cannot be confirmed against this coastline.

**Files:**
- Modify: `src/validate-positions.js`, `src/audit.js`
- Test: `src/validate-positions.test.js`, `src/audit.test.js`

**Interfaces:**
- Consumes: `isWithinCoverage(lat, lon)` from Task 1
- Produces: `coverageWarnings(map) -> string[]`; `classify()` may now return `{ verdict: "unverifiable" }`

- [ ] **Step 1: Write the failing tests**

Append to `src/validate-positions.test.js`:

```js
test("a position outside coastline coverage is reported, not passed", () => {
  const map = loadCorrections(`
noaa/1:
  position: [50.6033, -126.8117]
  reason: north of the clip
`);
  // Not a failure - validatePositions only reports positions on land.
  assert.deepEqual(validatePositions(map), []);
  const warnings = coverageWarnings(map);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /noaa\/1/);
  assert.match(warnings[0], /outside/);
});

test("a covered position produces no coverage warning", () => {
  const map = loadCorrections(`
noaa/1:
  position: [48.9, -123.2]
  reason: mid strait
`);
  assert.deepEqual(coverageWarnings(map), []);
});
```

Add `coverageWarnings` to the import from `./validate-positions.js`.

Append to `src/audit.test.js`:

```js
test("classify refuses to call an uncovered position clear", () => {
  const resolved = { id: "x", name: "X", latitude: 50.6033, longitude: -126.8117 };
  assert.deepEqual(classify(resolved), { verdict: "unverifiable" });
});
```

Add `classify` to the import from `./audit.js` if not already present.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/validate-positions.test.js src/audit.test.js`
Expected: FAIL — `coverageWarnings is not a function`; classify returns `{verdict:"clear"}`

- [ ] **Step 3: Write the implementations**

In `src/validate-positions.js`, change the import line and append the new export:

```js
import { isOnLand, isWithinCoverage } from "./coastline.js";
```

```js
/**
 * Positions the coastline cannot answer for.
 *
 * Reported separately from `validatePositions` because these are not
 * failures: a gate north of the Salish Sea clip is fine, it just cannot be
 * confirmed here. Silently passing it as water is the defect - the check
 * would be claiming a result it never computed.
 */
export function coverageWarnings(map) {
  const warnings = [];
  for (const [id, record] of map) {
    const position = record.position;
    if (!Array.isArray(position) || position.length !== 2) continue;
    const [lat, lon] = position;
    if (typeof lat !== "number" || typeof lon !== "number") continue;
    if (!isWithinCoverage(lat, lon)) {
      warnings.push(`${id}: position ${lat}, ${lon} is outside coastline coverage - cannot be verified`);
    }
  }
  return warnings;
}
```

In `src/audit.js`, change the import and the guard at the top of `classify`:

```js
import { inlandMetres, nearestWater, isWithinCoverage } from "./coastline.js";
```

```js
export function classify(resolved, thresholdM = REPORT_THRESHOLD_M) {
  if (resolved.positionVerified) return { verdict: "verified" };
  // Outside the coastline clip there is no land data, so inlandMetres would
  // return 0 and this would pin a "clear" it never actually checked.
  if (!isWithinCoverage(resolved.latitude, resolved.longitude)) return { verdict: "unverifiable" };
  const metresInland = inlandMetres(resolved.latitude, resolved.longitude);
  if (metresInland <= thresholdM) return { verdict: "clear" };
  return { verdict: "ashore", metresInland };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/validate-positions.test.js src/audit.test.js`
Expected: PASS

- [ ] **Step 5: Verify the lock is unchanged**

Run: `npm test && git diff --exit-code data/audit.lock.json`
Expected: all tests PASS, and `git diff` exits 0 — no locked station is outside coverage, so no verdict moved.

- [ ] **Step 6: Commit**

```bash
git add src/validate-positions.js src/audit.js src/validate-positions.test.js src/audit.test.js
git commit -m "Report uncovered positions rather than passing them as water"
```

---

### Task 3: The registry module

**Files:**
- Create: `src/registry.js`
- Test: `src/registry.test.js`

**Interfaces:**
- Produces: `loadRegistry(yamlText) -> Map<string, RegistryStation>`, `validateRegistry(registry, { corrections }) -> string[]`

- [ ] **Step 1: Write the failing test**

Create `src/registry.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadRegistry, validateRegistry } from "./registry.js";
import { loadCorrections } from "./corrections.js";

const VALID = `
chs-dodd-narrows:
  name: Dodd Narrows
  context: Nanaimo
  position: [49.1344, -123.8171]
  provider: chs
  providerId: 63aef1866a2b9417c035030f
  cities: [Nanaimo]
  aliases: [dodd]
`;

test("loads records keyed by station id", () => {
  const registry = loadRegistry(VALID);
  assert.equal(registry.get("chs-dodd-narrows").name, "Dodd Narrows");
  assert.deepEqual(registry.get("chs-dodd-narrows").position, [49.1344, -123.8171]);
});

test("accepts a valid registry", () => {
  assert.deepEqual(validateRegistry(loadRegistry(VALID)), []);
});

test("requires name, position, provider and providerId", () => {
  const problems = validateRegistry(loadRegistry("chs-x:\n  context: Somewhere\n"));
  assert.equal(problems.length, 4);
  for (const field of ["name", "position", "provider", "providerId"]) {
    assert.ok(problems.some((p) => p.includes(field)), `no problem mentioned ${field}`);
  }
});

test("rejects a malformed position", () => {
  const problems = validateRegistry(loadRegistry(`
chs-x:
  name: X
  position: 5
  provider: chs
  providerId: abc
`));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /position must be/);
});

test("rejects an out-of-range latitude", () => {
  const problems = validateRegistry(loadRegistry(`
chs-x:
  name: X
  position: [95, -123]
  provider: chs
  providerId: abc
`));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /latitude 95 is out of range/);
});

test("rejects a context that restates the name", () => {
  const problems = validateRegistry(loadRegistry(`
chs-dodd-narrows:
  name: Dodd Narrows
  context: Dodd Narrows Approach
  position: [49.1344, -123.8171]
  provider: chs
  providerId: abc
`));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /context repeats the name/);
});

test("rejects a malformed slug and duplicate slugs within the registry", () => {
  const problems = validateRegistry(loadRegistry(`
chs-a:
  name: A
  slug: Not A Slug
  position: [49, -123]
  provider: chs
  providerId: a
chs-b:
  name: B
  slug: dupe
  position: [49, -123]
  provider: chs
  providerId: b
chs-c:
  name: C
  slug: dupe
  position: [49, -123]
  provider: chs
  providerId: c
`));
  assert.equal(problems.length, 2);
  assert.ok(problems.some((p) => /must be lowercase/.test(p)));
  assert.ok(problems.some((p) => /duplicate slug "dupe"/.test(p)));
});

test("reports rather than throws on wrong types", () => {
  const problems = validateRegistry(loadRegistry(`
chs-x:
  name: 5
  position: [49, -123]
  provider: chs
  providerId: abc
  cities: "Nanaimo"
`));
  assert.ok(problems.some((p) => /name must be a string/.test(p)));
  assert.ok(problems.some((p) => /cities must be an array of strings/.test(p)));
});

test("an empty registry is valid", () => {
  assert.deepEqual(validateRegistry(loadRegistry("")), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/registry.test.js`
Expected: FAIL — cannot find module `./registry.js`

- [ ] **Step 3: Write the implementation**

Create `src/registry.js`:

```js
import { parse } from "yaml";
import { namesOverlap } from "./names.js";

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

    if (record.slug !== undefined && isString(record.slug)) {
      if (!/^[a-z0-9-]+$/.test(record.slug)) {
        problems.push(`${id}: slug "${record.slug}" must be lowercase letters, digits and hyphens`);
      }
      if (slugs.has(record.slug)) {
        problems.push(`${id}: duplicate slug "${record.slug}", also used by ${slugs.get(record.slug)}`);
      }
      slugs.set(record.slug, id);
    }

    if (corrections.has(id)) {
      problems.push(`${id}: declared in both the registry and corrections - a station has one source of authority`);
    }
  }

  for (const [id, record] of corrections) {
    if (record.slug !== undefined && isString(record.slug) && slugs.has(record.slug)) {
      problems.push(`${id}: slug "${record.slug}" collides with ${slugs.get(record.slug)} in the registry`);
    }
  }

  return problems;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/registry.test.js`
Expected: PASS, 9 tests

- [ ] **Step 5: Commit**

```bash
git add src/registry.js src/registry.test.js
git commit -m "Add the registry: stations whose identity this package owns"
```

---

### Task 4: Cross-file validation

**Files:**
- Test: `src/registry.test.js`

**Interfaces:**
- Consumes: `validateRegistry(registry, { corrections })` from Task 3

- [ ] **Step 1: Write the failing tests**

Append to `src/registry.test.js`:

```js
test("a station declared in both files is rejected", () => {
  const registry = loadRegistry(`
chs-dodd-narrows:
  name: Dodd Narrows
  position: [49.1344, -123.8171]
  provider: chs
  providerId: abc
`);
  const corrections = loadCorrections("chs-dodd-narrows:\n  name: Dodd\n");
  const problems = validateRegistry(registry, { corrections });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /both the registry and corrections/);
});

test("a slug colliding across files is rejected", () => {
  const registry = loadRegistry(`
chs-dodd-narrows:
  name: Dodd Narrows
  slug: nanaimo
  position: [49.1344, -123.8171]
  provider: chs
  providerId: abc
`);
  const corrections = loadCorrections("noaa/1:\n  name: Nanaimo\n  slug: nanaimo\n");
  const problems = validateRegistry(registry, { corrections });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /collides with chs-dodd-narrows/);
});

test("corrections with no overlap produce no cross-file problems", () => {
  const registry = loadRegistry(VALID);
  const corrections = loadCorrections("noaa/1:\n  name: Everett\n  slug: everett\n");
  assert.deepEqual(validateRegistry(registry, { corrections }), []);
});
```

- [ ] **Step 2: Run tests**

Run: `node --test src/registry.test.js`
Expected: PASS — Task 3's implementation already covers these; this task proves it. If any fail, fix `validateRegistry` rather than the test.

- [ ] **Step 3: Commit**

```bash
git add src/registry.test.js
git commit -m "Cover the cross-file registry rules"
```

---

### Task 5: Registry-aware resolution

Precedence becomes registry → corrections → provider data. A registry station resolves fully from `{ id }` alone, which is what CHS needs: the pipeline's output carries no position.

**Files:**
- Modify: `src/resolve.js`
- Test: `src/resolve.test.js`

**Interfaces:**
- Consumes: registry `Map` from Task 3
- Produces: `createResolver({ corrections, gazetteer, registry })`

- [ ] **Step 1: Write the failing tests**

Append to `src/resolve.test.js`:

```js
const registry = new Map([
  ["chs-dodd-narrows", {
    name: "Dodd Narrows",
    context: "Nanaimo",
    position: [49.1344, -123.8171],
    provider: "chs",
    providerId: "63aef1866a2b9417c035030f",
    cities: ["Nanaimo"],
    aliases: ["dodd"],
  }],
]);
const withRegistry = createResolver({ corrections, gazetteer, registry });

test("a registry station resolves from its id alone", () => {
  const r = withRegistry({ id: "chs-dodd-narrows" });
  assert.equal(r.name, "Dodd Narrows");
  assert.equal(r.context, "Nanaimo");
  assert.equal(r.slug, "dodd-narrows");
  assert.equal(r.latitude, 49.1344);
  assert.equal(r.longitude, -123.8171);
  assert.deepEqual(r.cities, ["Nanaimo"]);
  assert.equal(r.corrected, false);
  assert.equal(r.derived, false);
});

test("registry aliases include the name and slug", () => {
  const r = withRegistry({ id: "chs-dodd-narrows" });
  assert.ok(r.aliases.includes("dodd narrows"));
  assert.ok(r.aliases.includes("dodd-narrows"));
  assert.ok(r.aliases.includes("dodd"));
});

test("the registry outranks provider data", () => {
  const r = withRegistry({ id: "chs-dodd-narrows", name: "WRONG", latitude: 1, longitude: 2 });
  assert.equal(r.name, "Dodd Narrows");
  assert.equal(r.latitude, 49.1344);
});

test("a station not in the registry falls through to the overlay unchanged", () => {
  const r = withRegistry({ id: "noaa/9447659", name: "Everett", latitude: 47.98, longitude: -122.223 });
  assert.equal(r.name, "Everett");
  assert.equal(r.context, "Port Gardner");
});

test("a resolver with no registry behaves exactly as before", () => {
  const r = resolve({ id: "noaa/9447659", name: "Everett", latitude: 47.98, longitude: -122.223 });
  assert.equal(r.name, "Everett");
  assert.equal(r.context, "Port Gardner");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/resolve.test.js`
Expected: FAIL — registry ignored; `r.name` is `undefined` or throws in `cleanName`

- [ ] **Step 3: Write the implementation**

In `src/resolve.js`, change the signature and add the registry branch at the top of the returned function:

```js
export function createResolver({ corrections = new Map(), gazetteer = [], registry = new Map() } = {}) {
  return function resolve(station) {
    const owned = registry.get(station.id);
    if (owned) return resolveOwned(station.id, owned);

    const override = corrections.get(station.id) ?? {};
    // ... existing body unchanged from here ...
```

Add this function at the end of `src/resolve.js`:

```js
/**
 * Resolve a station the registry owns.
 *
 * Returns the same shape as the overlay path so consumers see one type.
 * `corrected` and `derived` are both false and both accurate: nothing was
 * corrected, because there is no published value to correct, and the context
 * was curated rather than derived from the gazetteer.
 *
 * Provider data on the incoming station is ignored outright - if the registry
 * owns a station, it is the authority, and quietly preferring a caller's name
 * would reintroduce exactly the ambiguity the registry exists to remove.
 */
function resolveOwned(id, owned) {
  const name = owned.name;
  const slug = owned.slug ?? toSlug(name);
  const aliases = new Set([
    name.toLowerCase(),
    slug,
    ...(owned.aliases ?? []).filter((a) => typeof a === "string").map((a) => a.toLowerCase()),
  ]);
  return {
    id,
    name,
    context: owned.context ?? "",
    slug,
    cities: owned.cities ?? [],
    aliases: [...aliases],
    latitude: owned.position[0],
    longitude: owned.position[1],
    corrected: false,
    derived: false,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — including every pre-existing resolve and seed test, which prove the overlay path is unchanged

- [ ] **Step 5: Commit**

```bash
git add src/resolve.js src/resolve.test.js
git commit -m "Resolve registry stations above the corrections overlay"
```

---

### Task 6: Generalize the build step

**Files:**
- Create: `scripts/build-data.mjs`
- Delete: `scripts/build-corrections-json.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `data/corrections.json` and `data/registry.json` from their YAML sources

- [ ] **Step 1: Create the generalized script**

Create `scripts/build-data.mjs`:

```js
#!/usr/bin/env node
/**
 * Compile every hand-edited YAML source to its JSON artifact.
 *
 * The YAML stays the source of truth - it is commentable and reviewable. The
 * JSON exists because a browser cannot read a file off disk and every runtime
 * can import JSON, and because Python consumers read these artifacts directly
 * with no npm involvement.
 *
 * Artifacts are committed rather than generated at publish time so the repo's
 * own tests exercise the same files consumers get, and CI can diff them back
 * against the YAML (`npm run check:data`). An artifact nobody can verify is an
 * artifact that silently drifts.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const SOURCES = ["corrections", "registry"];

for (const name of SOURCES) {
  const yamlPath = fileURLToPath(new URL(`../data/${name}.yaml`, import.meta.url));
  const jsonPath = fileURLToPath(new URL(`../data/${name}.json`, import.meta.url));
  const parsed = parse(readFileSync(yamlPath, "utf8")) ?? {};
  writeFileSync(jsonPath, JSON.stringify(parsed, null, 2) + "\n");
  console.log(`wrote ${jsonPath} — ${Object.keys(parsed).length} record(s)`);
}
```

- [ ] **Step 2: Create an empty registry so the build has a source**

```bash
printf '# Stations whose identity this package owns. See docs/superpowers/specs/2026-07-21-chs-station-registry-design.md\n' > data/registry.yaml
```

- [ ] **Step 3: Update package.json scripts**

Replace the `build:data` and `check:data` lines in `package.json`:

```json
    "build:data": "node scripts/build-data.mjs",
    "check:data": "npm run build:data && git diff --exit-code data/corrections.json data/registry.json",
```

- [ ] **Step 4: Run the build and verify both artifacts**

```bash
rm scripts/build-corrections-json.mjs
npm run build:data
```

Expected: two `wrote …` lines — `corrections.json — 23 record(s)` and `registry.json — 0 record(s)`

- [ ] **Step 5: Verify corrections.json is unchanged**

Run: `git diff --exit-code data/corrections.json`
Expected: exits 0 — the generalized script must produce a byte-identical corrections artifact

- [ ] **Step 6: Fix the now-dead reference in `src/index.js`**

`src/index.js:28` points at the script this task deletes. Change:

```js
 * See `scripts/build-corrections-json.mjs`.
```

to:

```js
 * See `scripts/build-data.mjs`.
```

Verify no other reference survives:

Run: `grep -rn "build-corrections-json" src/ bin/ README.md`
Expected: no output

- [ ] **Step 7: Commit**

```bash
git add scripts/build-data.mjs data/registry.yaml data/registry.json package.json src/index.js
git rm scripts/build-corrections-json.mjs
git commit -m "Generalize the data build to compile both YAML sources"
```

---

### Task 7: Seed the 19 CHS stations

Positions, provider ids and names are taken verbatim from `currents-vault/passes/*.md` frontmatter, cross-checked against `chs-constituents/stations/salish-sea.json` (all 19 uuids agree). Contexts are drawn from the vault's own prose. Boundary Pass is excluded — it is `provider: noaa` / `PUG1717`, not a CHS station, and giving NOAA a registry key is a Phase 3 decision.

**Files:**
- Modify: `data/registry.yaml`, `data/registry.json`
- Test: `src/seed-registry.test.js`

**Interfaces:**
- Consumes: `loadRegistry`, `validateRegistry`, `createResolver` from Tasks 3 and 5

- [ ] **Step 1: Write the registry**

Write `data/registry.yaml`:

```yaml
# Stations whose identity this package owns, rather than corrects.
#
# Unlike corrections.yaml, these records have no upstream to differ from: the
# name is not a provider's name and the position is not a correction of a
# published one. CHS tidal-current gates are the first data like this - the
# fitting pipeline emits a hand-written label and no position at all.
#
# Keys match what chs-constituents emits ("chs-" + slug of the label), so a
# consumer can resolve straight from the id in its own output.
#
# Positions and providerIds are taken from currents-vault pass frontmatter and
# agree with chs-constituents/stations/salish-sea.json. Contexts are written
# here.

chs-active-pass:
  name: Active Pass
  context: Galiano & Mayne Islands
  position: [48.8604, -123.3128]
  provider: chs
  providerId: 63aef09f84e5432cd3b6c509

chs-arran-rapids:
  name: Arran Rapids
  context: Stuart Island
  position: [50.42, -125.14]
  provider: chs
  providerId: 63aeff5884e5432cd3b71283

chs-beazley-passage:
  name: Beazley Passage
  context: Surge Narrows
  position: [50.2263, -125.142]
  provider: chs
  providerId: 63aefe506a2b9417c0350720
  aliases: [surge narrows]

chs-blackney-passage:
  name: Blackney Passage
  context: Blackfish Sound
  position: [50.555, -126.6842]
  provider: chs
  providerId: 63af00086a2b9417c0353154

chs-dent-rapids:
  name: Dent Rapids
  context: Cordero Channel
  position: [50.41, -125.2117]
  provider: chs
  providerId: 63af06d56a2b9417c0353451

chs-dodd-narrows:
  name: Dodd Narrows
  context: Nanaimo
  position: [49.1344, -123.8171]
  provider: chs
  providerId: 63aef1866a2b9417c035030f
  cities: [Nanaimo]

chs-first-narrows:
  name: First Narrows
  context: Lions Gate Bridge
  position: [49.316, -123.1401]
  provider: chs
  providerId: 5dd30650e0fdc4b9b4be6d24
  cities: [Vancouver]
  aliases: [lions gate]

chs-gabriola-passage:
  name: Gabriola Passage
  context: Gulf Islands
  position: [49.1291, -123.7043]
  provider: chs
  providerId: 63aef12e84e5432cd3b6db8d

chs-gillard-passage:
  name: Gillard Passage
  context: Yuculta Rapids
  position: [50.3933, -125.1567]
  provider: chs
  providerId: 5dd3064fe0fdc4b9b4be6978
  aliases: [yucultas]

chs-hole-in-the-wall:
  name: Hole in the Wall
  context: Okisollo Channel
  position: [50.3001, -125.2083]
  provider: chs
  providerId: 63aefcb26a2b9417c035071e

chs-johnstone-strait-central:
  name: Johnstone Strait - Central
  context: Port Neville
  position: [50.4717, -126.1367]
  provider: chs
  providerId: 63aeffc384e5432cd3b71285

chs-juan-de-fuca-east:
  name: Juan de Fuca - East
  context: Victoria approaches
  position: [48.2317, -123.53]
  provider: chs
  providerId: 63aeee1d84e5432cd3b6c500
  cities: [Victoria]

chs-porlier-pass:
  name: Porlier Pass
  context: Galiano & Valdes Islands
  position: [49.015, -123.585]
  provider: chs
  providerId: 63aef0ed84e5432cd3b6c50b

chs-race-passage:
  name: Race Passage
  context: Race Rocks
  position: [48.3067, -123.5367]
  provider: chs
  providerId: 63aeee896a2b9417c034d337
  cities: [Victoria]

chs-sechelt-rapids:
  name: Sechelt Rapids
  context: Skookumchuck Narrows
  position: [49.7383, -123.8983]
  provider: chs
  providerId: 63aef40a6a2b9417c0350313
  aliases: [skookumchuck]

chs-second-narrows:
  name: Second Narrows
  context: Burrard Inlet
  position: [49.2947, -123.0245]
  provider: chs
  providerId: 5dd30650e0fdc4b9b4be6c2d
  cities: [Vancouver]

chs-seymour-narrows:
  name: Seymour Narrows
  context: Discovery Passage
  position: [50.1333, -125.35]
  provider: chs
  providerId: 63aefc7784e5432cd3b6eb1e
  cities: [Campbell River]

chs-tillicum-bridge:
  name: Tillicum Bridge
  context: Gorge Waterway
  position: [48.4464, -123.4002]
  provider: chs
  providerId: 64960066ebd87908f1fcb787
  cities: [Victoria]

chs-weynton-passage:
  name: Weynton Passage
  context: Broughton Strait
  position: [50.6033, -126.8117]
  provider: chs
  providerId: 63af005f6a2b9417c0353158
```

- [ ] **Step 2: Write the seed test**

Create `src/seed-registry.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadRegistry, validateRegistry } from "./registry.js";
import { loadCorrections } from "./corrections.js";
import { createResolver } from "./resolve.js";
import { coverageWarnings } from "./validate-positions.js";

const read = (name) =>
  readFileSync(fileURLToPath(new URL(`../data/${name}`, import.meta.url)), "utf8");

const registry = loadRegistry(read("registry.yaml"));
const corrections = loadCorrections(read("corrections.yaml"));
const resolve = createResolver({ registry, corrections });

test("the shipped registry is valid against the shipped corrections", () => {
  assert.deepEqual(validateRegistry(registry, { corrections }), []);
});

test("every CHS gate in the fitting pipeline is present", () => {
  assert.equal(registry.size, 19);
  for (const [id, record] of registry) {
    assert.ok(id.startsWith("chs-"), `${id} is not a chs key`);
    assert.equal(record.provider, "chs");
  }
});

test("every station resolves with a name, a context and a position", () => {
  for (const id of registry.keys()) {
    const r = resolve({ id });
    assert.ok(r.name, `${id} has no name`);
    assert.notEqual(r.context, "", `${id} has no context`);
    assert.equal(typeof r.latitude, "number", `${id} has no latitude`);
    assert.equal(typeof r.longitude, "number", `${id} has no longitude`);
    assert.equal(r.corrected, false);
    assert.equal(r.derived, false);
  }
});

test("slugs are unique across the registry", () => {
  const slugs = [...registry.keys()].map((id) => resolve({ id }).slug);
  assert.equal(new Set(slugs).size, slugs.length);
});

// The three northern gates sit outside the coastline clip. Pinned so that a
// future coastline covering them changes this test visibly, rather than
// silently converting an unverifiable position into a verified one.
const OUTSIDE_COVERAGE = [
  "chs-blackney-passage",
  "chs-johnstone-strait-central",
  "chs-weynton-passage",
];

test("only the known northern gates are outside coastline coverage", () => {
  const warned = coverageWarnings(registry).map((w) => w.split(":")[0]);
  assert.deepEqual(warned.sort(), [...OUTSIDE_COVERAGE].sort());
});
```

- [ ] **Step 3: Build the artifact and run the tests**

```bash
npm run build:data
node --test src/seed-registry.test.js
```

Expected: `registry.json — 19 record(s)`, and all 5 tests PASS

- [ ] **Step 4: Verify positions against the source of record**

Run this one-off cross-check and confirm it prints `all 19 agree`:

```bash
node --input-type=module -e '
import { readFileSync, readdirSync } from "node:fs";
import { loadRegistry } from "./src/registry.js";
const reg = loadRegistry(readFileSync("data/registry.yaml","utf8"));
const chs = new Map(JSON.parse(readFileSync("../chs-constituents/stations/salish-sea.json","utf8")).map(s=>[s.label.toLowerCase(),s.id]));
let bad = 0;
for (const f of readdirSync("../currents-vault/passes")) {
  const t = readFileSync(`../currents-vault/passes/${f}`,"utf8");
  const g = (k)=>(t.match(new RegExp("^"+k+":\\s*(.+)$","m"))||[])[1];
  if (g("provider") !== "chs") continue;
  const key = "chs-" + g("name").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
  const r = reg.get(key);
  if (!r) { console.log(`MISSING ${key}`); bad++; continue; }
  if (r.providerId !== g("station_id")) { console.log(`uuid mismatch ${key}`); bad++; }
  if (r.position[0] !== parseFloat(g("latitude")) || r.position[1] !== parseFloat(g("longitude"))) {
    console.log(`position mismatch ${key}: ${r.position} vs ${g("latitude")},${g("longitude")}`); bad++;
  }
  if (chs.get(g("name").toLowerCase()) !== r.providerId) { console.log(`salish-sea uuid mismatch ${key}`); bad++; }
}
console.log(bad ? `${bad} problem(s)` : "all 19 agree");'
```

Expected: `all 19 agree`

- [ ] **Step 5: Commit**

```bash
git add data/registry.yaml data/registry.json src/seed-registry.test.js
git commit -m "Seed the registry with the 19 CHS tidal-current gates"
```

---

### Task 8: Public API and types

Exports and declarations must land together: `src/public-surface.test.js` fails if an export has no declaration.

**Files:**
- Modify: `src/index.js`, `index.d.ts`, `types/surface.ts`, `package.json`
- Test: `src/index.test.js`

**Interfaces:**
- Produces: `loadRegistry`, `validateRegistry` exported from the package root; `createBundledResolver()` resolves registry stations

- [ ] **Step 1: Write the failing test**

Append to `src/index.test.js`:

```js
test("the bundled resolver resolves a registry station from its id", () => {
  const resolve = createBundledResolver();
  const r = resolve({ id: "chs-dodd-narrows" });
  assert.equal(r.name, "Dodd Narrows");
  assert.equal(r.context, "Nanaimo");
  assert.equal(r.latitude, 49.1344);
  assert.equal(r.corrected, false);
});

test("the bundled resolver still resolves an overlay station", () => {
  const resolve = createBundledResolver();
  const r = resolve({ id: "noaa/9447659", name: "Everett", latitude: 47.98, longitude: -122.223 });
  assert.equal(r.name, "Everett");
  assert.equal(r.context, "Port Gardner");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/index.test.js`
Expected: FAIL — registry not wired into `createBundledResolver`

- [ ] **Step 3: Update `src/index.js`**

Add the import, the export, and the registry argument:

```js
import registry from "../data/registry.json" with { type: "json" };
```

```js
export { loadRegistry, validateRegistry } from "./registry.js";
```

```js
export function createBundledResolver() {
  return createResolver({
    corrections: new Map(Object.entries(corrections)),
    registry: new Map(Object.entries(registry)),
    gazetteer,
  });
}
```

- [ ] **Step 4: Add the declarations to `index.d.ts`**

```ts
/** A station whose identity this package owns, rather than corrects. */
export interface RegistryStation {
  name: string;
  position: [number, number];
  provider: string;
  providerId: string;
  context?: string;
  slug?: string;
  cities?: string[];
  aliases?: string[];
}

/** Registry entries keyed by stable station id, e.g. `chs-dodd-narrows`. */
export type Registry = Map<string, RegistryStation>;

/** Parse a registry YAML document into a map keyed by station id. */
export function loadRegistry(yamlText: string): Registry;

/**
 * Check a registry for the mistakes contributors make. Pass `corrections` to
 * enable the cross-file rules (no station in both files, no slug collisions).
 */
export function validateRegistry(
  registry: Registry,
  options?: { corrections?: Corrections },
): string[];
```

Update the `createResolver` declaration to accept the registry:

```ts
export function createResolver(options?: {
  corrections?: Corrections;
  gazetteer?: GazetteerPlace[];
  registry?: Registry;
}): Resolver;
```

- [ ] **Step 5: Add usage to `types/surface.ts`**

Extend the **existing** import block from `"../index.js"` (it ends at line 30) with these four names rather than adding a second import statement:

```ts
  loadRegistry,
  validateRegistry,
  type Registry,
  type RegistryStation,
```

Then add the usage:

```ts
const reg: Registry = loadRegistry("chs-x:\n  name: X\n");
const entry: RegistryStation | undefined = reg.get("chs-x");
const regProblems: string[] = [
  ...validateRegistry(reg),
  ...validateRegistry(reg, { corrections }),
];
const fromRegistry: Resolver = createResolver({ corrections, gazetteer, registry: reg });
```

Add `reg, entry, regProblems, fromRegistry` to the exported `surface` object so `noUnusedLocals` stays useful.

- [ ] **Step 6: Ship the artifact**

Confirm `data/registry.json` is covered by the `files` array in `package.json` — `data` is already listed, so no change should be needed. Verify with:

```bash
npm pack --dry-run 2>&1 | grep registry
```

Expected: both `data/registry.json` and `data/registry.yaml` appear

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS — including `browser-safe.test.js` (registry.json is a JSON import, no Node builtin), `public-surface.test.js` (both new exports declared), and `tsc`

- [ ] **Step 8: Commit**

```bash
git add src/index.js index.d.ts types/surface.ts src/index.test.js
git commit -m "Export the registry API and resolve registry stations from the bundle"
```

---

### Task 9: CLI, CI and README

**Files:**
- Modify: `bin/station-corrections.mjs`, `README.md`
- Test: `bin/station-corrections.test.mjs`

**Interfaces:**
- Consumes: `loadRegistry`, `validateRegistry`, `coverageWarnings`

- [ ] **Step 1: Write the failing test**

Append to `bin/station-corrections.test.mjs`:

```js
test("validate checks the registry and reports coverage gaps as notes", () => {
  const result = run(["validate"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /corrections file is valid/);
  // The three northern gates cannot be checked against the clipped coastline.
  assert.match(result.stderr, /outside coastline coverage/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bin/station-corrections.test.mjs`
Expected: FAIL — no coverage note in stderr

- [ ] **Step 3: Update the CLI**

Rename the private helper to avoid colliding with the new public `loadRegistry` concept — replace every occurrence of `loadStations(` with `readStationsFile(` in `bin/station-corrections.mjs`, including its declaration on line 24.

Add one import, and **replace** the existing `validate-positions` import on line 8 rather than adding a second — a duplicate import of the same module is a syntax error:

```js
import { loadRegistry, validateRegistry } from "../src/registry.js";
```

Line 8 becomes:

```js
import { validatePositions, coverageWarnings } from "../src/validate-positions.js";
```

Load the registry beside the corrections near the top:

```js
const registry = loadRegistry(
  readFileSync(fileURLToPath(new URL("../data/registry.yaml", import.meta.url)), "utf8"),
);
```

Replace the `validate` block:

```js
if (command === "validate") {
  const stations = stationsPath ? readStationsFile("validate", stationsPath) : null;
  const problems = [
    ...validateCorrections(corrections),
    ...validatePositions(corrections),
    ...validateRegistry(registry, { corrections }),
    ...validatePositions(registry),
    ...(stations ? validateAgainstStations(corrections, stations) : []),
  ];
  for (const problem of problems) console.error(problem);

  // Not failures: a position outside the clipped coastline is unconfirmable,
  // not wrong. Printed so nobody reads a clean run as "all positions checked".
  for (const warning of [...coverageWarnings(corrections), ...coverageWarnings(registry)]) {
    console.error(`note: ${warning}`);
  }
  if (!stations) {
    console.error("note: no stations file given - skipping the distance-from-published check");
  }
  console.error(problems.length ? `\n${problems.length} problem(s)` : "corrections file is valid");
  process.exit(problems.length ? 1 : 0);
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS. `node bin/station-corrections.mjs validate` exits 0 and prints three `note: … outside coastline coverage` lines.

- [ ] **Step 5: Update the README**

Add after the "Three tiers" section heading, replacing the existing three-item list:

```markdown
Every lookup resolves highest-first:

1. **Registry** — `data/registry.yaml`. Stations whose identity this package owns rather than
   corrects, because there is no upstream to correct. Resolves from an id alone.
2. **Curated override** — anything in `data/corrections.yaml` wins over provider data.
3. **Derived fallback** — nearest place from the bundled gazetteer, so context is never empty.
   Flagged `derived: true`.
4. **Source data** — the provider's own name, cleaned.
```

Add a new section before "## Finding stations that are on land":

```markdown
## The registry

Some stations have no upstream record to correct. CHS tidal-current gates are the case this was
built for: the fitting pipeline emits a hand-written label and no position at all, so there is
nothing to overlay onto — the record here *is* the station.

```yaml
chs-dodd-narrows:
  name: Dodd Narrows
  context: Nanaimo
  position: [49.1344, -123.8171]
  provider: chs
  providerId: 63aef1866a2b9417c035030f
```

`providerId` stays separate from the key: `chs-dodd-narrows` is stable and safe in a URL, while
`63aef186…` is an opaque API handle. A station may not appear in both files — two sources of
authority for one station is the bug, not a feature — and slugs must be unique across both,
because URLs share one namespace.

A corrected `position` is checked for plausible distance from what the provider published; a
registry position is not, because it *is* the published value. That absence is deliberate.

**Coverage.** The bundled coastline is clipped to the Salish Sea, so positions north of it —
Blackney Passage, Johnstone Strait, Weynton Passage — cannot be confirmed as being in water.
`validate` reports these as notes rather than passing them silently.
```

- [ ] **Step 6: Final verification**

```bash
npm test
node bin/station-corrections.mjs validate
npm run check:data
git diff --exit-code data/audit.lock.json
```

Expected: tests PASS; validate exits 0 with three coverage notes; `check:data` exits 0; the lock is unchanged.

- [ ] **Step 7: Commit**

```bash
git add bin/station-corrections.mjs bin/station-corrections.test.mjs README.md
git commit -m "Validate the registry from the CLI and document it"
```

---

## Out of scope

- **Phases 2–4** (chs-constituents, currents-vault, currents-mcp migrations) are separate plans.
- **Boundary Pass** (`provider: noaa`, `PUG1717`) is the twentieth vault gate and is not seeded. Giving NOAA stations registry keys is a Phase 3 decision; the vault keeps its own entry until then.
- **Widening the coastline** north to cover the Broughtons. Issue #2 records the performance cost of a wider clip.
- **A `source` field** on resolved output. `corrected: false, derived: false` already describes a registry station accurately.

# Phase 2A: Drop providerId/providerBin from the registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Remove `providerId` and `providerBin` from the `station-corrections` registry entirely — schema, validation, data, tests, and docs — so the published package ships only facts (name, position, context, provider) and zero provider-minted identifiers.

**Architecture:** `providerId` (a CHS-minted opaque handle) and `providerBin` (a NOAA depth cell) were correlation/fetch artifacts, not identity. Phase 1 already freed `chs-constituents` from needing them (it fetches ids live from CHS). The only remaining consumer is `currents-mcp`, which switches to name-correlation in Phase 2B — so this task removes the fields cleanly. The registry's public join key becomes the station **name** (and its stable `slug`/`key`), which are facts anyone may publish.

**Tech Stack:** Node ESM, `node --test`, TypeScript declaration (`tsc` over `index.d.ts`), YAML source compiled to JSON (`npm run build:data`).

## Global Constraints

- **YAML is the source of truth; JSON is a committed artifact.** After editing `data/registry.yaml`, run `npm run build:data` and commit both. `npm run check:data` (`build:data` + `git diff --exit-code`) must pass — it fails if the two are out of sync (it will show a diff until committed).
- **Full test command:** `npm test` = `node --test && tsc -p tsconfig.json`. Both must be green.
- **After this task, no `providerId` or `providerBin` may remain anywhere in `station-corrections`** except in prose that explains their removal. Verify with `grep -rn -e providerId -e providerBin src data index.d.ts` at the end (README/PROVENANCE prose is allowed to name them historically).
- **This is a breaking change to a published package** (`@sailingnaturali/station-corrections`) — bump the major version. Do NOT publish/tag/release; that is the human's call.
- `provider` (the string `"chs"`/`"noaa"`) STAYS — it is a fact and identifies the tide authority. Only `providerId` and `providerBin` are removed. The `source` field added earlier also stays (update only its bin wording).
- Cross-repo note (do NOT act on it here): `currents-mcp`'s vendored `_registry.json` drift test will go red against this repo until Phase 2B re-vendors. That is expected and is Phase 2B's job.

---

### Task 1: Remove the fields from schema, validation, and their tests

**Files:**
- Modify: `index.d.ts` (RegistryStation interface)
- Modify: `src/registry.js` (validateRegistry)
- Modify: `src/registry.test.js` (the required-fields test + the providerBin tests + fixtures)

**Interfaces:**
- `validateRegistry(registry, { corrections? })` keeps its signature; it no longer requires `providerId` nor validates `providerBin`.
- `RegistryStation` loses `providerId` and `providerBin`.

- [ ] **Step 1: Update the tests first (TDD — define the new contract)**

In `src/registry.test.js`:

a. Line ~27–30, the test titled `"requires name, position, provider and providerId"`: rename to `"requires name, position and provider"` and change the field loop from `["name", "position", "provider", "providerId"]` to `["name", "position", "provider"]`.

b. Remove `providerId: <value>` lines from every fixture in this file (the YAML-string fixtures at lines ~12, 41, 53, 66, 79, 85, 91, 104, 121, 136, 156, 161, 173, 187, 199, 212, 219, 231, 245, 259, 264). They are noise for tests that check slugs/context/collisions; the field no longer exists.

c. Remove these five whole tests (they validate `providerBin`, which is being deleted):
   - `"accepts a providerBin as a positive integer"`
   - `"rejects a non-number providerBin"`
   - `"rejects a fractional providerBin"`
   - `"rejects a negative providerBin"`
   - `"rejects a zero providerBin"`
   Delete each test block in full, including its `providerId:`/`providerBin:` fixture lines.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test src/registry.test.js`
Expected: FAIL — `validateRegistry` still requires `providerId` (so the renamed required-fields test now expects only 3 missing-field errors but the code still errors when providerId is absent), OR passes stale. Confirm the failure ties to the still-present `providerId` requirement in `registry.js`.

- [ ] **Step 3: Update `src/registry.js`**

a. In `validateRegistry`, change the required-string loop:
```js
    for (const field of ["name", "provider"]) {
```
(was `["name", "provider", "providerId"]`).

b. Delete the entire `providerBin` validation block (the comment about NOAA depth-cell bins plus the `if (record.providerBin !== undefined) { ... }` block that pushes `providerBin must be a number` / `providerBin must be a positive integer`).

- [ ] **Step 4: Update `index.d.ts`**

In `interface RegistryStation`, delete these two members (and the `providerBin` doc comment above it):
```ts
  providerId: string;
  /** Depth-cell bin for providers (NOAA) that report current data per bin. Not every provider has this concept. */
  providerBin?: number;
```
Leave `name`, `position`, `provider`, `source`, `context`, `slug`, `cities`, `aliases`, `formerSlugs`.

- [ ] **Step 5: Run tests to verify green**

Run: `npm test`
Expected: `node --test` all pass, `tsc` clean.

- [ ] **Step 6: Commit**

```bash
git add index.d.ts src/registry.js src/registry.test.js
git commit -m "feat!: drop providerId/providerBin from the registry schema and validation"
```
(End the message with the workspace trailers — see the dispatch.)

---

### Task 2: Remove the fields from the data and remaining fixtures

**Files:**
- Modify: `data/registry.yaml` (all entries + header comment)
- Regenerate: `data/registry.json` (via `npm run build:data`)
- Modify: `src/resolve.test.js` (fixture `providerId` lines)
- Modify: `src/slugs-lock.test.js` (fixture `providerId` lines)

- [ ] **Step 1: Edit `data/registry.yaml`**

a. Remove the `providerId: <hex>` line from all 19 CHS entries and the `providerId: PUG1717` line from `noaa-boundary-pass`.

b. Remove `providerBin: 35` from `noaa-boundary-pass`.

c. In `noaa-boundary-pass`'s `source:` text, drop the bin mention. Change:
```
    NOAA CO-OPS station PUG1717; position and bin from the NOAA station page,
    not the CHS fitting pipeline that supplies the other gates. See PROVENANCE.md.
```
to:
```
    NOAA CO-OPS station; position from the NOAA station page, not the CHS
    fitting pipeline that supplies the other gates. See PROVENANCE.md.
```

d. Rewrite the header comment block so it no longer describes `providerId`/`providerBin`. Replace the sentences about "positions and providerIds", the "One entry is not CHS ... Its providerId is a NOAA station id ... it sets providerBin" paragraph, with a version that states: names/contexts are hand-written; positions are independently derived; the registry ships no provider-minted identifiers (the id lives only in each operator's local, licence-covered pipeline — see PROVENANCE.md); `noaa-boundary-pass` is the one NOAA station, carried because `currents-vault` curates the same gates. Keep the `formerSlugs` and `source` explanations.

- [ ] **Step 2: Rebuild the JSON artifact**

Run: `npm run build:data`
Expected: `wrote .../data/registry.json — 20 record(s)`.

- [ ] **Step 3: Confirm no id remains in the data**

Run: `grep -n -e providerId -e providerBin data/registry.yaml data/registry.json`
Expected: no matches.

- [ ] **Step 4: Remove `providerId` from the remaining test fixtures**

a. `src/resolve.test.js` lines ~231, 257, 295: remove the `providerId: "..."` property from those registry-entry fixtures (e.g. `["chs-broken", { name: "Broken", provider: "chs", providerId: "1" }]` → `["chs-broken", { name: "Broken", provider: "chs" }]`).

b. `src/slugs-lock.test.js` lines ~20, 76, 84: remove the `providerId: a` fixture lines.

- [ ] **Step 5: Run the full suite + data check**

Run: `npm test && npm run check:data`
Expected: all tests pass, tsc clean, `check:data` exits 0 (once the rebuilt JSON is committed in Step 6 it stays clean; before commit it may show the staged diff — that is fine, the assertion is that build:data produces no *new* diff).

- [ ] **Step 6: Commit**

```bash
git add data/registry.yaml data/registry.json src/resolve.test.js src/slugs-lock.test.js
git commit -m "feat!: remove providerId/providerBin from registry data and fixtures"
```

---

### Task 3: Update docs and bump the major version

**Files:**
- Modify: `README.md` (the "## The registry" section)
- Modify: `PROVENANCE.md` (the per-field table + surrounding prose)
- Modify: `package.json` (version)

- [ ] **Step 1: Rewrite the README "## The registry" section**

The current section explains `providerId` (the ```yaml``` example includes `providerId: 63aef186…` and a paragraph "`providerId` stays separate from the key …"). Rewrite so it:
- Shows the example WITHOUT `providerId`/`providerBin`:
```yaml
chs-dodd-narrows:
  name: Dodd Narrows
  context: Nanaimo
  position: [49.1344, -123.8171]
  provider: chs
```
- Explains that the registry ships **no provider-minted identifier**: a consumer joins a registry entry to a provider's live data by **name** (the stable `slug`/key is the public id, safe in a URL), and the provider's own opaque handle is resolved at runtime by whoever holds a licence to that provider's API — never redistributed here. Link to `PROVENANCE.md`.
- Keep the existing paragraphs about a registry position being the published value (not distance-checked) and the Salish Sea coastline coverage note.

- [ ] **Step 2: Update `PROVENANCE.md`**

The per-field table currently has a `providerId`, `providerBin` row calling it "the provider's own opaque handle … the one field that points into a provider's system." Update the document to state that the registry now ships **zero** provider-minted identifiers: remove that row from the table (or replace it with a line stating the id is deliberately absent and resolved at runtime under the operator's own provider licence). Adjust the "honest summary" sentence accordingly — the names/context/positions are our work; there is no provider handle in the published data at all. This strengthens, not weakens, the provenance story. Keep everything else (the Feist/CCH reasoning, the "don't redistribute their file" rule, the contributor section — update the contributor note that says `providerId` is "the exception" since it is no longer present).

- [ ] **Step 3: Bump the major version**

In `package.json`, change `"version": "1.5.0"` to `"version": "2.0.0"` (removing published fields is a breaking change).

- [ ] **Step 4: Final verification**

Run: `npm test`
Expected: all green.
Run: `grep -rn -e providerId -e providerBin src data index.d.ts`
Expected: no matches (prose in README/PROVENANCE may still name them historically — that is allowed and expected).

- [ ] **Step 5: Commit**

```bash
git add README.md PROVENANCE.md package.json
git commit -m "docs: registry ships no provider id; bump to 2.0.0"
```

---

## Self-Review

**Spec coverage:** schema (Task 1: index.d.ts), validation (Task 1: registry.js), validation tests (Task 1: registry.test.js), data (Task 2: yaml+json), remaining fixtures (Task 2: resolve/slugs-lock tests), docs (Task 3: README+PROVENANCE), version (Task 3). Every `providerId`/`providerBin` site from the grounding grep is covered.

**Type consistency:** `RegistryStation` loses two members; `validateRegistry` keeps its signature. No function renamed. The `source` field (added earlier) is retained; only its bin wording changes.

**Out of scope (Phase 2B):** `currents-mcp` name-correlation + re-vendoring the id-less `_registry.json` + `Gate` field removal. The vendored-copy drift test going red against this repo is expected until then. Also out of scope: the workspace `CLAUDE.md` line describing station identity as "(name, position, provider, provider id)" is now stale — flag to the human for the infrastructure repo; do not edit cross-repo here.

#!/usr/bin/env node
/**
 * Compile data/corrections.yaml to data/corrections.json.
 *
 * The YAML stays the source of truth — it is the hand-edited, PR-reviewed,
 * commentable file. The JSON is a build artifact that exists for one reason:
 * a browser cannot read a file off disk, so the bundled resolver needs the
 * corrections as something every runtime can `import`. JSON is that, YAML
 * is not.
 *
 * The artifact is committed rather than generated at publish time so the
 * repo's own tests exercise the same file consumers get, and CI can diff it
 * back against the YAML (see `npm run check:data`) — an artifact nobody can
 * verify is an artifact that silently drifts.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const yamlPath = fileURLToPath(new URL("../data/corrections.yaml", import.meta.url));
const jsonPath = fileURLToPath(new URL("../data/corrections.json", import.meta.url));

const corrections = parse(readFileSync(yamlPath, "utf8")) ?? {};
writeFileSync(jsonPath, JSON.stringify(corrections, null, 2) + "\n");

console.log(`wrote ${jsonPath} — ${Object.keys(corrections).length} correction(s)`);

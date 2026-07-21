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

#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { auditStations } from "../src/audit.js";
import { createResolver } from "../src/resolve.js";
import { loadCorrections, validateCorrections } from "../src/corrections.js";
import { fileURLToPath } from "node:url";

const corrections = loadCorrections(
  readFileSync(fileURLToPath(new URL("../data/corrections.yaml", import.meta.url)), "utf8"),
);

const [command, stationsPath] = process.argv.slice(2);

if (command === "validate") {
  const problems = validateCorrections(corrections);
  for (const problem of problems) console.error(problem);
  console.error(problems.length ? `\n${problems.length} problem(s)` : "corrections file is valid");
  process.exit(problems.length ? 1 : 0);
}

if (command === "audit") {
  if (!stationsPath) {
    console.error("usage: station-corrections audit <stations.json>");
    process.exit(1);
  }
  const stations = JSON.parse(readFileSync(stationsPath, "utf8"));
  const findings = auditStations(stations, { resolve: createResolver({ corrections }) });
  for (const finding of findings) {
    console.log(`${finding.id.padEnd(16)} ${finding.name.padEnd(24)} ${finding.metresInland} m inland`);
    console.log(
      finding.suggestion
        ? `  nearest water: ${finding.suggestion.latitude}, ${finding.suggestion.longitude}`
        : "  nearest water: none found within range - needs a human look",
    );
  }
  console.log(`\n${findings.length} of ${stations.length} ashore`);
  process.exit(0);
}

console.error("usage: station-corrections <validate|audit> [stations.json]");
process.exit(1);

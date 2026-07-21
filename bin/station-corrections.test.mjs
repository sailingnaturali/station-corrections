import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const bin = fileURLToPath(new URL("./station-corrections.mjs", import.meta.url));

function runAudit(path) {
  try {
    const stdout = execFileSync("node", [bin, "audit", path], { encoding: "utf8" });
    return { status: 0, stdout, stderr: "" };
  } catch (err) {
    return { status: err.status, stdout: err.stdout, stderr: err.stderr };
  }
}

test("audit prints a clear message and exits non-zero on a missing stations file", () => {
  const dir = mkdtempSync(join(tmpdir(), "station-corrections-test-"));
  const path = join(dir, "missing.json");
  const { status, stderr } = runAudit(path);
  rmSync(dir, { recursive: true, force: true });

  assert.notEqual(status, 0);
  assert.match(stderr, /missing\.json/);
  assert.doesNotMatch(stderr, /at Object|at Module|node:internal/);
});

test("audit prints a clear message and exits non-zero on malformed JSON", () => {
  const dir = mkdtempSync(join(tmpdir(), "station-corrections-test-"));
  const path = join(dir, "bad.json");
  writeFileSync(path, "{ this is not json");
  const { status, stderr } = runAudit(path);
  rmSync(dir, { recursive: true, force: true });

  assert.notEqual(status, 0);
  assert.match(stderr, /bad\.json/);
  assert.doesNotMatch(stderr, /at Object|at Module|node:internal/);
});

test("audit rejects a stations file that is a JSON object instead of an array", () => {
  const dir = mkdtempSync(join(tmpdir(), "station-corrections-test-"));
  const path = join(dir, "object.json");
  writeFileSync(path, JSON.stringify({ id: "noaa/1", name: "Not An Array" }));
  const { status, stderr } = runAudit(path);
  rmSync(dir, { recursive: true, force: true });

  assert.notEqual(status, 0);
  assert.match(stderr, /array/i);
});

test("audit resolves stations through the same bundled resolver library consumers get", () => {
  // A hand-rolled createResolver({ corrections }) omits the gazetteer, so it
  // resolves differently from createBundledResolver() - not visible in
  // today's audit output (which never reads context), but a real
  // inconsistency the CLI must not have.
  const source = readFileSync(bin, "utf8");
  assert.match(source, /createBundledResolver\(\)/);
});

test("audit rejects a stations file that is a JSON string instead of an array", () => {
  const dir = mkdtempSync(join(tmpdir(), "station-corrections-test-"));
  const path = join(dir, "string.json");
  writeFileSync(path, JSON.stringify("just a string"));
  const { status, stderr } = runAudit(path);
  rmSync(dir, { recursive: true, force: true });

  assert.notEqual(status, 0);
  assert.match(stderr, /array/i);
});

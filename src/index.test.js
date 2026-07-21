import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

test("createBundledResolver resolves a known station regardless of cwd", async () => {
  const originalCwd = process.cwd();
  // A cwd-relative path (the bug this guards against) would fail here even
  // though it happens to work from the repo root.
  process.chdir(tmpdir());
  try {
    const { createBundledResolver } = await import("./index.js");
    const resolve = createBundledResolver();
    const r = resolve({ id: "noaa/9447659", name: "Everett", latitude: 47.98, longitude: -122.223 });
    assert.equal(r.name, "Everett");
    assert.equal(r.context, "Port Gardner");
  } finally {
    process.chdir(originalCwd);
  }
});

test("the bundled resolver resolves a registry station from its id", async () => {
  const { createBundledResolver } = await import("./index.js");
  const resolve = createBundledResolver();
  const r = resolve({ id: "chs-dodd-narrows" });
  assert.equal(r.name, "Dodd Narrows");
  assert.equal(r.context, "Nanaimo");
  assert.equal(r.latitude, 49.1344);
  assert.equal(r.corrected, false);
});

test("the bundled resolver still resolves an overlay station", async () => {
  const { createBundledResolver } = await import("./index.js");
  const resolve = createBundledResolver();
  const r = resolve({ id: "noaa/9447659", name: "Everett", latitude: 47.98, longitude: -122.223 });
  assert.equal(r.name, "Everett");
  assert.equal(r.context, "Port Gardner");
});

test("index.js never references the coastline module", () => {
  // Importing the library must not pull in the 3.6 MB coastline (only
  // audit-related code needs it). A static check on the source is enough:
  // this file only ever imports resolve.js, corrections.js, clean.js and
  // slug.js, none of which touch coastline.js either.
  const source = readFileSync(fileURLToPath(new URL("./index.js", import.meta.url)), "utf8");
  assert.doesNotMatch(source, /from\s+["'][^"']*coastline/);
});

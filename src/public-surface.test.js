import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as index from "./index.js";

const srcDir = fileURLToPath(new URL(".", import.meta.url));

/**
 * Modules whose entire export surface is deliberately excluded from index.js.
 * Each one transitively imports coastline.js, which parses the 3.6 MB
 * coastline at *import time* - re-exporting any of these from index.js would
 * make importing the package root pay that cost. audit.js and coastline.js
 * are audit-only internals; validate-positions.js is opt-in only, reachable
 * by a consumer who explicitly wants it via the "./validate-positions"
 * subpath export instead of through the package root.
 */
const COASTLINE_DEPENDENT_MODULES = new Set(["audit.js", "coastline.js", "validate-positions.js"]);

/** Named exports that are internal implementation details, not public API, even though their module is otherwise public. */
const INTERNAL_EXPORTS = new Set([
  "namesOverlap", // corrections.js: helper shared by resolve.js and validateCorrections itself, not a consumer-facing utility
]);

test("every public-API module's named exports are re-exported from index.js", async () => {
  // This is the regression test for the bug class this guards against: a
  // module gains an export (like lock.js's buildLock/readLock/diffLock did)
  // and nobody wires it into index.js, so it ships unreachable from the
  // package root. Walking every src/*.js file's actual exports - rather than
  // hand-listing what "should" be there - means a forgotten export fails
  // this test instead of shipping silently.
  const files = readdirSync(srcDir).filter(
    (f) => f.endsWith(".js") && !f.endsWith(".test.js") && f !== "index.js",
  );
  assert.ok(files.length > 0, "sanity check: expected to find sibling modules to scan");

  for (const file of files) {
    if (COASTLINE_DEPENDENT_MODULES.has(file)) continue;
    const mod = await import(`./${file}`);
    for (const name of Object.keys(mod)) {
      if (INTERNAL_EXPORTS.has(name)) continue;
      assert.ok(name in index, `${file} exports "${name}" but index.js does not re-export it`);
    }
  }
});

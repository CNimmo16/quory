import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createManifest } from "./release.mjs";
const targets = JSON.parse(
  readFileSync(
    new URL(
      "../../apps/marketing/src/data/download-targets.json",
      import.meta.url,
    ),
  ),
);
test("requires every architecture before a release can be promoted", () => {
  const dir = mkdtempSync(join(tmpdir(), "quory-manifest-"));
  try {
    assert.throws(
      () => createManifest(dir, "1.2.3"),
      /Missing required installer/,
    );
    for (const t of targets)
      writeFileSync(join(dir, `quory-1.2.3-${t.suffix}`), "test installer");
    const m = createManifest(dir, "1.2.3");
    assert.equal(m.assets.length, 5);
    assert.equal(
      m.assets[0].sha256,
      createHash("sha256").update("test installer").digest("hex"),
    );
    assert.match(m.assets[0].url, /%40quory%2Fclient%401.2.3/);
    writeFileSync(join(dir, `quory-1.2.3-${targets[0].suffix}`), "");
    assert.throws(() => createManifest(dir, "1.2.3"), /Empty installer/);
    assert.throws(
      () => createManifest(dir, "../oops"),
      /stable desktop version/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

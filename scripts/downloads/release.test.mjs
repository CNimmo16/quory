import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { createManifest } from "./release.mjs";
// Filenames emitted by the release packaging jobs, independent of the manifest
// configuration so a mismatch between producer and consumer fails this test.
const installers = [
  "quory-1.2.3-mac-arm64.dmg",
  "quory-1.2.3-mac-x64.dmg",
  "quory-1.2.3-win-x64-setup.exe",
  "quory-1.2.3-linux-x86_64.AppImage",
  "quory-1.2.3-linux-amd64.deb",
];
test("requires every architecture before a release can be promoted", () => {
  const dir = mkdtempSync(join(tmpdir(), "quory-manifest-"));
  try {
    assert.throws(
      () => createManifest(dir, "1.2.3"),
      /Missing required installer/,
    );
    for (const filename of installers)
      writeFileSync(join(dir, filename), "test installer");
    const m = createManifest(dir, "1.2.3");
    assert.deepEqual(m.assets.map((asset) => asset.filename), installers);
    for (const asset of m.assets) {
      assert.equal(
        asset.url,
        `https://github.com/CNimmo16/quory/releases/download/%40quory%2Fclient%401.2.3/${asset.filename}`,
      );
    }
    assert.equal(m.assets[3].id, "linux-x64-appimage");
    assert.equal(m.assets[4].id, "linux-x64-deb");
    assert.equal(
      m.assets[0].sha256,
      createHash("sha256").update("test installer").digest("hex"),
    );
    assert.match(m.assets[0].url, /%40quory%2Fclient%401.2.3/);
    rmSync(join(dir, installers[4]));
    assert.throws(
      () => createManifest(dir, "1.2.3"),
      /Missing required installer: quory-1\.2\.3-linux-amd64\.deb/,
    );
    writeFileSync(join(dir, installers[4]), "test installer");
    writeFileSync(join(dir, installers[0]), "");
    assert.throws(() => createManifest(dir, "1.2.3"), /Empty installer/);
    assert.throws(
      () => createManifest(dir, "../oops"),
      /stable desktop version/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const require = createRequire(import.meta.url);
const electronVersion = require("electron/package.json").version;
const nodeGyp = require.resolve("node-gyp/bin/node-gyp.js");
// The hoisted LevelDB binding and PouchDB's nested copy can differ in version.
const pouchdbRequire = createRequire(require.resolve("pouchdb/package.json"));
const manifests = new Set([
  require.resolve("leveldown/package.json"),
  pouchdbRequire.resolve("leveldown/package.json"),
  require.resolve("better-sqlite3/package.json"),
  require.resolve("cpu-features/package.json"),
]);

for (const manifest of manifests) {
  const { name, version } = JSON.parse(readFileSync(manifest, "utf8"));
  process.stdout.write(
    `Rebuilding ${name}@${version} for Electron ${electronVersion} (${process.arch})\n`
  );
  if (name === "cpu-features") {
    writeFileSync(
      join(dirname(manifest), "buildcheck.gypi"),
      execFileSync(process.execPath, ["buildcheck.js"], { cwd: dirname(manifest) })
    );
  }
  execFileSync(
    process.execPath,
    [
      nodeGyp,
      "rebuild",
      `--target=${electronVersion}`,
      `--arch=${process.arch}`,
      "--dist-url=https://electronjs.org/headers",
      `--devdir=${join(homedir(), ".electron-gyp")}`,
      "--jobs=2",
    ],
    { cwd: dirname(manifest), stdio: "inherit" }
  );
}

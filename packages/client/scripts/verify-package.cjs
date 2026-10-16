const { execFileSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const { resolve, join } = require("node:path");
const [platform, arch] = process.argv.slice(2);
const folder =
  platform === "mac"
    ? arch === "arm64"
      ? "mac-arm64"
      : "mac"
    : platform === "win"
      ? "win-unpacked"
      : "linux-unpacked";
const root = resolve("dist", folder);
const resources =
  platform === "mac"
    ? join(root, "quory.app/Contents/Resources")
    : join(root, "resources");
const executable =
  platform === "mac"
    ? join(root, "quory.app/Contents/MacOS/quory")
    : join(root, platform === "win" ? "quory.exe" : "quory");
const manifest = join(resources, "app.asar/package.json");
if (!existsSync(executable))
  throw new Error(`Missing packaged executable: ${executable}`);
const probe = `
 const req = require('node:module').createRequire(process.argv[1]);
 const assert = require('node:assert/strict');
 assert.equal(process.arch, process.argv[2]);
 req('pouchdb');
 const sqliteReq = require('node:module').createRequire(req.resolve('@quory/sqlite/package.json'));
 const Database = sqliteReq('better-sqlite3');
 const db = new Database(':memory:');
 assert.equal(db.prepare('select 1 as value').get().value, 1);
 db.close();
 console.log('Packaged Electron/native module smoke test passed');
`;
execFileSync(executable, ["-e", probe, manifest, arch], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  stdio: "inherit",
  timeout: 60000,
});
if (platform === "mac")
  execFileSync(
    "codesign",
    ["--verify", "--deep", "--strict", join(root, "quory.app")],
    { stdio: "inherit" },
  );

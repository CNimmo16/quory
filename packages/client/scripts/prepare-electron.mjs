import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const electronDirectory = dirname(require.resolve("electron/package.json"));
const pathFile = join(electronDirectory, "path.txt");
const versionFile = join(electronDirectory, "dist", "version");
const version = require("electron/package.json").version;
const executable = existsSync(pathFile)
  ? readFileSync(pathFile, "utf8").trim()
  : "";
const installed =
  Boolean(executable) &&
  existsSync(versionFile) &&
  readFileSync(versionFile, "utf8").trim().replace(/^v/, "") === version &&
  existsSync(join(electronDirectory, "dist", executable));

if (!installed) {
  process.stdout.write(`Restoring Electron ${version} runtime…\n`);
  // Only discard the incomplete, regenerable runtime inside node_modules.
  rmSync(join(electronDirectory, "dist"), { recursive: true, force: true });
  execFileSync(process.execPath, [join(electronDirectory, "install.js")], {
    stdio: "inherit",
    env: { ...process.env, ELECTRON_SKIP_BINARY_DOWNLOAD: "" },
  });
}

const electron = require("electron");
const clientManifest = fileURLToPath(
  new URL("../package.json", import.meta.url)
);
const probe = `
  const appRequire = require('node:module').createRequire(process.argv[1]);
  appRequire('leveldown');
  appRequire('pouchdb');
  appRequire('ssh2');
  const Database = appRequire('better-sqlite3');
  const db = new Database(':memory:');
  db.prepare('SELECT 1').get();
  db.close();
`;
function checkBindings() {
  execFileSync(electron, ["-e", probe, clientManifest], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: "pipe",
  });
}

try {
  checkBindings();
} catch {
  process.stdout.write(`Rebuilding native modules for Electron ${version}…\n`);
  execFileSync(
    process.execPath,
    [fileURLToPath(new URL("./rebuild-native.mjs", import.meta.url))],
    { stdio: "inherit" }
  );
  checkBindings();
}

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import test from "node:test";

function fixture(
  t,
  { cpuFeatures = false, missingSqlite = false, failBuild = false } = {},
) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "quory-native-test-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, contents) => {
    const destination = join(root, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, contents);
  };
  const pkg = (path, name, version = "1.0.0") =>
    write(`${path}/package.json`, JSON.stringify({ name, version }));
  pkg("node_modules/electron", "electron", "31.0.2");
  pkg("node_modules/pouchdb", "pouchdb");
  pkg("node_modules/leveldown", "leveldown");
  pkg("node_modules/pouchdb/node_modules/leveldown", "leveldown", "2.0.0");
  if (!missingSqlite) pkg("node_modules/better-sqlite3", "better-sqlite3");
  if (cpuFeatures) {
    pkg("node_modules/cpu-features", "cpu-features");
    write("node_modules/cpu-features/buildcheck.js", "console.log('{}');");
  }
  // Run the real rebuild script, replacing only the expensive native compiler.
  write(
    "node_modules/node-gyp/bin/node-gyp.js",
    `
    const fs = require('node:fs');
    fs.appendFileSync(process.env.QUORY_REBUILD_LOG,
      JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(2) }) + '\\n');
    process.exit(${failBuild ? 1 : 0});
  `,
  );
  const script = join(root, "rebuild-native.mjs");
  copyFileSync(new URL("./rebuild-native.mjs", import.meta.url), script);
  const log = join(root, "rebuilds.jsonl");
  writeFileSync(log, "");
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, QUORY_REBUILD_LOG: log, NODE_PATH: "" },
  });
  const builds = readFileSync(log, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map(JSON.parse);
  return { root, result, builds };
}

test("rebuilds required bindings when optional cpu-features is absent", (t) => {
  const { root, result, builds } = fixture(t);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    builds.map(({ cwd }) => relative(root, cwd).replaceAll("\\", "/")),
    [
      "node_modules/leveldown",
      "node_modules/pouchdb/node_modules/leveldown",
      "node_modules/better-sqlite3",
    ],
  );
  for (const { args } of builds) {
    assert(args.includes("--target=31.0.2"));
    assert(args.includes(`--arch=${process.arch}`));
    assert(args.includes("--dist-url=https://electronjs.org/headers"));
  }
});

test("also prepares and rebuilds cpu-features when installed", (t) => {
  const { root, result, builds } = fixture(t, { cpuFeatures: true });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(builds.length, 4);
  assert.equal(builds.at(-1).cwd, join(root, "node_modules/cpu-features"));
  assert.equal(
    readFileSync(
      join(root, "node_modules/cpu-features/buildcheck.gypi"),
      "utf8",
    ),
    "{}\n",
  );
});

test("still rejects a missing required SQLite dependency", (t) => {
  const { result } = fixture(t, { missingSqlite: true });
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /Cannot find module 'better-sqlite3\/package.json'/,
  );
});

test("still fails when a native compilation fails", (t) => {
  const { result, builds } = fixture(t, { failBuild: true });
  assert.notEqual(result.status, 0);
  assert.equal(builds.length, 1);
});

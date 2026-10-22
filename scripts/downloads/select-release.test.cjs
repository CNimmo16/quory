const assert = require("node:assert/strict");
const { test } = require("node:test");
const selectRelease = require("./select-release.cjs");

const version = "1.0.10";
const filenames = [
  "quory-1.0.10-mac-arm64.dmg",
  "quory-1.0.10-mac-x64.dmg",
  "quory-1.0.10-win-x64-setup.exe",
  "quory-1.0.10-linux-x86_64.AppImage",
  "quory-1.0.10-linux-amd64.deb",
  "downloads.json",
  "SHA256SUMS.txt",
];
const assets = filenames.map((name) => ({
  name,
  state: "uploaded",
  size: 100,
}));

function fixture({ release = { assets }, error } = {}) {
  const calls = [];
  return {
    calls,
    args: {
      context: { repo: { owner: "CNimmo16", repo: "quory" } },
      core: { info() {} },
      currentVersion: version,
      github: {
        rest: {
          repos: {
            async getReleaseByTag(params) {
              calls.push(params);
              if (error) throw error;
              return { data: release };
            },
          },
        },
      },
    },
  };
}

test("recovers an empty release even when npm published nothing", async () => {
  const { args, calls } = fixture({ release: { assets: [] } });
  assert.equal(await selectRelease(args), version);
  assert.deepEqual(calls, [
    { owner: "CNimmo16", repo: "quory", tag: "@quory/client@1.0.10" },
  ]);
});

test("retries a partially uploaded set, including missing metadata", async () => {
  for (const missing of filenames) {
    const { args } = fixture({
      release: { assets: assets.filter((a) => a.name !== missing) },
    });
    assert.equal(await selectRelease(args), version, missing);
  }
});

test("does not rebuild complete releases on unrelated pushes", async () => {
  assert.equal(await selectRelease(fixture().args), "");
});

test("a failed or empty upload does not count as a complete set", async () => {
  for (const invalid of [{ state: "starter" }, { size: 0 }]) {
    const { args } = fixture({
      release: { assets: [{ ...assets[0], ...invalid }, ...assets.slice(1)] },
    });
    assert.equal(await selectRelease(args), version);
  }
});

test("manual recovery selects an explicit existing version without npm output", async () => {
  const { args, calls } = fixture();
  assert.equal(
    await selectRelease({ ...args, requestedVersion: "1.0.9" }),
    "1.0.9",
  );
  assert.equal(calls[0].tag, "@quory/client@1.0.9");
});

test("new npm client releases take precedence over the checkout's version", async () => {
  const { args, calls } = fixture();
  assert.equal(
    await selectRelease({
      ...args,
      publishedPackages: [{ name: "@quory/client", version: "1.0.11" }],
    }),
    "1.0.11",
  );
  assert.equal(calls[0].tag, "@quory/client@1.0.11");
});

test("an unreleased checkout skips packaging, but an explicit missing release fails", async () => {
  const { args } = fixture({
    error: Object.assign(new Error("Not found"), { status: 404 }),
  });
  assert.equal(await selectRelease(args), "");
  await assert.rejects(
    selectRelease({ ...args, requestedVersion: version }),
    /Not found/,
  );
  await assert.rejects(
    selectRelease({
      ...args,
      publishedPackages: [{ name: "@quory/client", version }],
    }),
    /Not found/,
  );
});

test("API failures are not mistaken for an unpublished version", async () => {
  const { args } = fixture({
    error: Object.assign(new Error("Forbidden"), { status: 403 }),
  });
  await assert.rejects(selectRelease(args), /Forbidden/);
});

test("rejects invalid version input before any API request", async () => {
  const { args, calls } = fixture();
  for (const requestedVersion of [
    "main",
    "../1.0.10",
    "1.0.10-beta.1",
    "1.0.10\n",
  ]) {
    await assert.rejects(
      selectRelease({ ...args, requestedVersion }),
      /stable desktop version/,
    );
  }
  assert.equal(calls.length, 0);
});

test("draft and prerelease releases cannot become stable downloads", async () => {
  for (const flag of ["draft", "prerelease"]) {
    const { args } = fixture({ release: { assets, [flag]: true } });
    await assert.rejects(selectRelease(args), /published stable release/);
  }
});

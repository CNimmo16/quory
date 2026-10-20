const { test } = require("node:test");
const assert = require("node:assert/strict");
const checkTrust = require("./check-npm-trust.cjs");

function fixture() {
  const messages = [];
  const core = {
    async getIDToken(audience) {
      assert.equal(audience, "npm:registry.npmjs.org");
      return "test-id-token";
    },
    setSecret(value) {
      assert.equal(value, "test-id-token");
    },
    info(message) {
      messages.push(message);
    },
  };
  return { core, messages };
}

test("checks every public package without logging publish credentials", async () => {
  const { core, messages } = fixture();
  const names = [];
  await checkTrust({
    core,
    fetch: async (url, options) => {
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer test-id-token");
      assert.equal(options.redirect, "error");
      const prefix =
        "https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/";
      assert.ok(url.startsWith(prefix));
      names.push(decodeURIComponent(url.slice(prefix.length)));
      return Response.json({ token: "test-publish-token" });
    },
  });
  assert.deepEqual(names.sort(), [
    "@quory/client",
    "@quory/core",
    "@quory/mysql",
    "@quory/postgres",
    "@quory/sqlite",
    "@quory/stack",
  ]);
  assert.equal(messages.length, 6);
  assert.doesNotMatch(messages.join("\n"), /test-id-token|test-publish-token/);
});

test("reports all rejected exchanges and preserves npm's diagnostic", async () => {
  const { core } = fixture();
  await assert.rejects(
    checkTrust({
      core,
      packages: ["@quory/core", "@quory/client"],
      fetch: async () =>
        Response.json(
          { body: { message: "No matching trusted publisher" } },
          { status: 404 },
        ),
    }),
    (error) => {
      assert.match(error.message, /@quory\/core: OIDC exchange HTTP 404/);
      assert.match(error.message, /@quory\/client: OIDC exchange HTTP 404/);
      assert.match(error.message, /No matching trusted publisher/);
      return true;
    },
  );
});

test("handles network errors and invalid registry responses", async () => {
  for (const fetch of [
    async () => {
      throw new Error("network error");
    },
    async () => new Response("not JSON", { status: 502 }),
    async () => Response.json({}),
  ]) {
    const { core } = fixture();
    await assert.rejects(
      checkTrust({ core, packages: ["@quory/core"], fetch }),
      /@quory\/core:/,
    );
  }
});

test("redacts the OIDC token if an error response repeats it", async () => {
  const { core } = fixture();
  await assert.rejects(
    checkTrust({
      core,
      packages: ["@quory/core"],
      fetch: async () =>
        Response.json(
          { error: "Rejected test-id-token" },
          { status: 401 },
        ),
    }),
    (error) => {
      assert.match(error.message, /Rejected \[redacted\]/);
      assert.doesNotMatch(error.message, /test-id-token/);
      return true;
    },
  );
});

const { readdirSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

function publicPackages() {
  const root = join(__dirname, "../../packages");
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) =>
      JSON.parse(readFileSync(join(root, entry.name, "package.json"), "utf8")),
    )
    .filter((pkg) => !pkg.private)
    .map((pkg) => pkg.name);
}

// Called by actions/github-script. Never log or persist either kind of token.
// Checking the exchange separately preserves errors hidden by publish fallback.
module.exports = async ({
  core,
  fetch = globalThis.fetch,
  packages = publicPackages(),
}) => {
  const idToken = await core.getIDToken("npm:registry.npmjs.org");
  core.setSecret(idToken);
  const failures = [];
  for (const name of packages) {
    const url =
      "https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/" +
      encodeURIComponent(name);
    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      failures.push(`${name}: unable to reach npm's OIDC token exchange`);
      continue;
    }
    const body = await response.json().catch(() => null);
    if (response.ok && typeof body?.token === "string" && body.token) {
      core.info(`${name}: npm accepted the workflow's OIDC identity`);
      continue;
    }
    const detail = [
      body?.body?.message,
      body?.message,
      body?.error,
    ].find((value) => typeof value === "string");
    failures.push(
      `${name}: OIDC exchange HTTP ${response.status}` +
        (detail
          ? ` — ${detail.split(idToken).join("[redacted]").slice(0, 1000)}`
          : response.ok
            ? " — response did not contain a publish token"
            : ""),
    );
  }
  if (failures.length) {
    throw new Error(
      failures.join("\n") +
        "\nCheck each package's npm trusted publisher: CNimmo16/quory, " +
        "release.yml, no environment, and an unexpired configuration. " +
        "Direct uploads also require Allow npm publish.",
    );
  }
};

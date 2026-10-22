// Select an existing release independently of whether npm published this run.
module.exports = async ({
  github,
  context,
  core,
  publishedPackages = [],
  requestedVersion = "",
  currentVersion = require("../../packages/client/package.json").version,
  targets = require("../../apps/marketing/src/data/download-targets.json"),
}) => {
  const newlyPublished = publishedPackages.find(
    (pkg) => pkg.name === "@quory/client",
  );
  const explicit = Boolean(requestedVersion || newlyPublished);
  const version = requestedVersion || newlyPublished?.version || currentVersion;
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error("Expected a stable desktop version, for example 1.0.10");
  }
  let release;
  try {
    ({ data: release } = await github.rest.repos.getReleaseByTag({
      ...context.repo,
      tag: `@quory/client@${version}`,
    }));
  } catch (error) {
    if (error.status !== 404 || explicit) throw error;
    core.info(
      `Client ${version} has no GitHub release yet; skipping desktop packaging`,
    );
    return "";
  }
  if (release.draft || release.prerelease) {
    throw new Error(
      `Desktop ${version} must be an existing published stable release`,
    );
  }
  const expected = [
    ...targets.map((target) => `quory-${version}-${target.suffix}`),
    "downloads.json",
    "SHA256SUMS.txt",
  ];
  const uploaded = new Set(
    release.assets
      .filter((asset) => asset.state === "uploaded" && asset.size > 0)
      .map((asset) => asset.name),
  );
  const missing = expected.filter((name) => !uploaded.has(name));
  if (!explicit && missing.length === 0) {
    core.info(`Desktop ${version} already has a complete download set`);
    return "";
  }
  core.info(
    requestedVersion
      ? `Rebuilding desktop ${version} from its release tag by request`
      : `Completing desktop ${version}; missing assets: ${missing.join(", ")}`,
  );
  return version;
};

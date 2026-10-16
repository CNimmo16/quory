// Custom signing hook: no certificate or Apple account.
const { createRequire } = require("node:module");
const builderRequire = createRequire(
  require.resolve("app-builder-lib/package.json"),
);
const { signAsync } = builderRequire("@electron/osx-sign");
module.exports = async (options) => {
  await signAsync({
    ...options,
    identity: "-",
    identityValidation: false,
    preAutoEntitlements: false,
    preEmbedProvisioningProfile: false,
    optionsForFile: (file) => ({
      ...options.optionsForFile(file),
      hardenedRuntime: false,
      timestamp: "none",
    }),
  });
};

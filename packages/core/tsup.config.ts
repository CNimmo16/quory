import { defineConfig } from "tsup";

export default defineConfig({
  // The Electron runtime loads the CJS build, so bundle this ESM-only dependency.
  noExternal: ["lodash-es"],
});

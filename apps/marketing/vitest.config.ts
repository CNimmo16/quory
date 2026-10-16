import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL("../../", import.meta.url)),
  test: {
    include: [
      "apps/marketing/src/lib/*.test.ts",
      "apps/marketing/worker/*.test.ts",
    ],
    environment: "node",
  },
});

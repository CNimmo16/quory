import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["apps/marketing/src/lib/*.test.ts"], environment: "node" },
});

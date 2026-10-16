import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import clientPackage from "./package.json";

const rendererDependencies = Object.keys(clientPackage.dependencies).filter(
  (name) =>
    name.includes("react") ||
    name === "cmdk" ||
    name.startsWith("@codemirror/"),
);

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Keep the Electron renderer on one React 18 instance in the mixed-version workspace.
    dedupe: ["react", "react-dom"],
    alias: { "@renderer": resolve(__dirname, "src/renderer/src") },
  },
  test: {
    deps: {
      optimizer: {
        web: {
          enabled: true,
          include: [
            "react",
            "react-dom",
            "react-dom/client",
            "@testing-library/react",
            "@codemirror/state",
            "@codemirror/view",
            ...rendererDependencies,
          ],
        },
      },
    },
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    environmentMatchGlobs: [["src/main/**", "node"]],
  },
});

import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";

// automatically adds all package.json deps to rollupOptions.external
const extPlugin = externalizeDepsPlugin({
  exclude: ["@quory/stack", "@quory/core"],
});

export default defineConfig({
  main: {
    plugins: [extPlugin],
    build: {
      sourcemap: "hidden",
      rollupOptions: {
        external: ["pg"],
      },
    },
  },
  preload: {
    plugins: [extPlugin],
    build: {
      sourcemap: "hidden",
      rollupOptions: {
        external: ["pg"],
      },
    },
  },
  renderer: {
    build: { sourcemap: "hidden" },
    resolve: {
      dedupe: ["react", "react-dom"],
      alias: {
        "@renderer": resolve("src/renderer/src"),
      },
    },
    plugins: [react(), TanStackRouterVite()],
  },
});

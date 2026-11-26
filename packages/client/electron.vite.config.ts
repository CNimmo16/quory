import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";

// automatically adds all package.json deps to rollupOptions.external
const extPlugin = externalizeDepsPlugin({
  exclude: ["@quory/stack", "@quory/core"],
});

export default defineConfig(({ command }) => ({
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
      alias: [
        {
          find: "@renderer",
          replacement: resolve(__dirname, "src/renderer/src"),
        },
        // Use one source module graph in development. Watching tsup output can
        // replace the context and all consumers together in an opaque bundle.
        ...(command === "serve"
          ? [
              {
                find: /^@quory\/stack\/react$/,
                replacement: resolve(__dirname, "../stack/src/react/index.ts"),
              },
              {
                find: /^@quory\/stack\/react\/ui\/(.+)$/,
                replacement: resolve(
                  __dirname,
                  "../stack/src/react/components/ui/$1",
                ),
              },
            ]
          : []),
      ],
    },
    plugins: [react(), TanStackRouterVite()],
  },
}));

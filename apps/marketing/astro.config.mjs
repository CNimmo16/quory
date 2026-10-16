import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import react from "@astrojs/react";
import starlight from "@astrojs/starlight";
import { siteSettings } from "./scripts/site-config.mjs";

export default defineConfig({
  site: process.env.SITE_DOMAIN
    ? siteSettings(process.env.SITE_DOMAIN).SITE_URL
    : undefined,
  integrations: [
    react(),
    starlight({
      title: "Quory docs",
      description:
        "Find related records, explore your database, and build with Quory.",
      disable404Route: true,
      customCss: ["./src/styles/docs.css"],
      components: {
        Head: "./src/components/docs/Head.astro",
        SiteTitle: "./src/components/docs/SiteTitle.astro",
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/CNimmo16/quory",
        },
      ],
      sidebar: [
        {
          label: "Start here",
          items: [
            { label: "Quick Start", slug: "docs" },
            { label: "How Quory works", slug: "docs/concepts" },
          ],
        },
        { label: "Desktop client", autogenerate: { directory: "docs/client" } },
        { label: "Core library", autogenerate: { directory: "docs/core" } },
        {
          label: "Stack integrations",
          autogenerate: { directory: "docs/stack" },
        },
        {
          label: "Database drivers",
          autogenerate: { directory: "docs/drivers" },
        },
        {
          label: "Contributing",
          autogenerate: { directory: "docs/contributing" },
        },
        { label: "Download Quory", link: "/downloads/" },
      ],
    }),
  ],
  vite: {
    // Content sync during `astro check` uses production mode. Keep its React
    // prebundles separate so checks/builds cannot overwrite a running dev server's.
    cacheDir:
      process.env.NODE_ENV === "production"
        ? "./node_modules/.vite/production"
        : "./node_modules/.vite/development",
    plugins: [tailwindcss()],
    server: { strictPort: true },
  },
  devToolbar: { enabled: false },
});

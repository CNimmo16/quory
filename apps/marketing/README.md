# Quory marketing

Public marketing site built with Astro. The site generates static HTML and does not require a database or content service.

## Local preview

From the repository root:

```sh
pnpm install
pnpm marketing:dev
```

Open http://127.0.0.1:4321. Changes to the source update the development preview automatically.

## Editing text

Edit the copy directly in the Astro markup:

- `src/pages/index.astro`: homepage sections, feature cards, workflow, and Cloud copy.
- `src/pages/docs/index.astro`: documentation page copy and metadata.
- `src/pages/404.astro`: page-not-found copy.
- `src/layouts/Layout.astro`: shared navigation, footer, default page title, and description.
- `src/components/QueryPreview.astro`: illustrative query example.

Links live alongside their labels in these files. Use `<br />` for intentional line breaks.

## Styling

The marketing site uses Tailwind CSS 4 through the official `@tailwindcss/vite` plugin, following [Astro’s Tailwind guide](https://docs.astro.build/en/guides/styling/#tailwind).

Edit Tailwind utilities directly in the Astro markup. Responsive variants retain the existing 520px, 780px, 1100px, and 1450px breakpoints. The query preview uses `aria-pressed:` utilities for selected tables and descendant utilities for dynamically generated table cells.

`src/styles/global.css` imports Tailwind and the shared fonts, and contains only base styles, keyboard focus, selection, and reduced-motion rules. `tailwind.config.cjs` loads the shared desktop theme preset through Tailwind 4’s `@config` compatibility support, preserving palette tokens and system/light/dark themes without duplicating them. There is no PostCSS setup for the marketing site.

## Check, build, and preview

```sh
pnpm --filter @quory/marketing check
pnpm marketing:build
pnpm marketing:start
```

The build writes static files to `dist/`. The start command previews that build at http://127.0.0.1:4321. Rebuild after editing source to update the production preview.

## Deployment

Deploy the contents of `dist/` to a static host after running `pnpm marketing:build`. Configure the host to serve `404.html` for missing routes. No environment variables or server runtime are required.

## Database logo sources

Official assets are stored locally in `public/logos/`:

- PostgreSQL: https://wiki.postgresql.org/wiki/Logo (three-color elephant).
- MySQL: https://www.mysql.com/about/legal/logos.html (Includes MySQL conditional-use logo; retain its link to MySQL and original colors/design).
- SQLite: https://www.sqlite.org/images/sqlite370_banner.svg (official website banner).

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

## Desktop downloads

`/downloads/` and the shared `DownloadButton.astro` use the same release manifest.
The checked-in `src/data/downloads.json` contains verified assets from desktop
1.0.6 (Apple Silicon macOS, x64 Windows, x64 Linux). It is the server-rendered and
offline/network-failure fallback. It deliberately does **not** advertise an Intel
Mac installer that has not yet been released.

At runtime the website fetches `latest.json` from the repository's
`download-manifest` branch on `raw.githubusercontent.com`. This public static
file needs no API token, release-list API call, website redeploy, or server.
Invalid, older, or unavailable manifests fall back to the bundled release.
Only known installer IDs and exact GitHub asset URLs for the stated desktop
version are accepted. If your host has a Content Security Policy, allow
`https://raw.githubusercontent.com` in `connect-src`.

OS detection changes the icon and label immediately. Architecture hints are used
where available; macOS's legacy `Intel` user-agent string is not trusted. Unknown
architectures, mobile devices, ChromeOS, and unsupported platforms open the
platform picker. The split button also lets visitors choose a different platform.
Download buttons and platform choices first show an optional email dialog.
Continue validates the email; Skip bypasses the input. Both proceed to the chosen
installer. Signup is UI-only: no email is read, stored, or sent, and closing the
dialog clears the input. Without JavaScript, the links still work directly.
Each available installer links to `/downloads/install/<installer-id>/?start=1`,
which starts the download and displays platform-specific installation steps.
The page consumes the start flag before downloading so refreshing does not start
another download. A direct retry link is always available, including without
JavaScript. Updates are manual during early access.

### Release process

The existing Changesets flow triggers packaging when `@quory/client` is released.
The workflow builds on native Apple Silicon, Intel Mac, Windows x64 and Linux x64
runners. It prepares Electron's native dependencies, produces installers with OS
and architecture in their filenames, and smoke-tests each packaged runtime.
Mac builds use a certificate-free ad-hoc signature, with notarization disabled.
Windows builds are not publisher-signed. No signing credentials are needed.

Only after **all four jobs pass** does the publish job generate SHA-256 checksums,
upload the five installers and `downloads.json` to the versioned desktop release,
and promote `latest.json` on `download-manifest`. An incomplete build/upload leaves
the previous website release intact. The workflow creates that branch on its first
successful release and needs `contents: write` permission for the publish job.
Branch protection must permit that workflow to update `download-manifest`.

No new installers or manifests are published by a local website build. Before the
first CI run, the remote manifest may return 404; the site uses the checked-in
1.0.6 files. Refresh the bundled manifest after releases if you want the no-JS
fallback to use the latest version too.

The smoke tests verify native bindings and Mac signature integrity. They do not
replace first-install testing of downloaded/quarantined files on clean machines.
Before a public launch, test both Mac architectures, the Windows installer, and
Linux AppImage/deb. Unsigned apps can be blocked by managed-device policy.

### Checks

From the repository root:

```sh
pnpm exec vitest run --config apps/marketing/vitest.config.ts
node --test scripts/downloads/release.test.mjs
pnpm marketing:build
```

For local Mac packaging, after `pnpm build`, from `packages/client`:

```sh
node scripts/prepare-electron.mjs
CSC_IDENTITY_AUTO_DISCOVERY=false pnpm exec electron-builder --mac --arm64 --publish never
node scripts/verify-package.cjs mac arm64
```

Use `--x64` and `mac x64` on an Intel Mac. A local DMG is not a release; the
publish job requires the complete multi-platform installer set.

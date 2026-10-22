# Quory marketing

Public marketing site built with Astro. Pages are static; a Cloudflare Worker handles email signup and confirmation, backed by D1 and Resend.

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
- `src/content/docs/docs/`: Starlight documentation in Markdown and MDX.
- `src/pages/404.astro`: page-not-found copy.
- `src/layouts/Layout.astro`: shared navigation, footer, default page title, and description.
- `src/components/QueryPreview.astro`: illustrative query example.

Links live alongside their labels in these files. Use `<br />` for intentional line breaks.

## Documentation

The `/docs/` section uses [Starlight](https://starlight.astro.build/), following its
[existing-site setup](https://starlight.astro.build/manual-setup/#use-starlight-at-a-subpath).
Content lives under `src/content/docs/docs/` so the marketing homepage remains at `/`.
The introduction helps readers choose between the desktop client, core library, and
stack integration. Each has its own guide section, alongside database drivers and
local development. These are task-focused guides, not an API reference.

Add a Markdown or MDX file with `title`, `description`, and `sidebar.order`
frontmatter to the relevant directory. `src/content.config.ts` validates content;
`astro.config.mjs` defines sidebar groups. Use `/docs/.../` links between guides.

Docs use Starlight's navigation, table of contents, code blocks, theme switcher, and
Pagefind search. Search is generated during `pnpm marketing:build`; test it using
`pnpm marketing:start`. `src/styles/docs.css` loads the shared fonts, and
`src/components/docs/Head.astro` maps the shared palette into Starlight's light and
dark colour variables without loading the marketing Tailwind reset.

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

The `Marketing` GitHub Actions workflow builds static assets and deploys them with
the Worker. `/api/*` goes to the Worker; everything else is served as static files.
Pull requests run checks only. Pushes to `main` (or a manual run on `main`) deploy
through the GitHub environment named **production**, after checks pass. D1
migrations run before deployment. The desktop release workflow is independent.

See [Cloudflare setup](./CLOUDFLARE.md) for the environment settings, one-time
Cloudflare setup, local development, and exporting the email list.

## PostHog and homepage experiment

The main site and Starlight docs use PostHog EU project **312110**, sharing the
desktop app's public project token. Events carry `app: quory-marketing`. Production
builds capture pageviews, unhandled browser exceptions, and session replay when
enabled in the project. Input values are masked; console logs, network headers,
and bodies are not recorded. URL queries/fragments are removed from event and
replay URLs so confirmation tokens are not collected. Signup events do not include
email addresses. Development and localhost previews send no telemetry.

The production deployment uploads hidden sourcemaps under release name
`quory-marketing`, using the Git commit SHA as the version. Uploads happen before
deployment, and maps are deleted before Cloudflare receives the assets. Configure
these in GitHub Actions' **production** environment (repository settings also work):

| Name                     | Type     | Value                                                                                            |
| ------------------------ | -------- | ------------------------------------------------------------------------------------------------ |
| `POSTHOG_CLI_API_KEY`    | Secret   | Personal API key with Error tracking: Write and Organization: Read, authorized for this project. |
| `POSTHOG_CLI_PROJECT_ID` | Variable | `312110`                                                                                         |

The [draft experiment](https://eu.posthog.com/project/312110/experiments/102804)
uses [feature flag `marketing-homepage-copy-v1`](https://eu.posthog.com/project/312110/feature_flags/322578).
Only the hero eyebrow, headline,
and description change; CTAs and the rest of the page stay consistent. Copy lives
in `src/lib/homepage-copy.ts`, with control HTML in `src/pages/index.astro`.

| Variant           | Split | Headline                          |
| ----------------- | ----- | --------------------------------- |
| `control`         | 34%   | Get answers faster with Quory.    |
| `customer-issues` | 33%   | Find the answer. Fix it faster.   |
| `skip-the-joins`  | 33%   | Your next answer is a click away. |

Assignment uses PostHog's anonymous visitor ID. The page records standard
`$feature_flag_called` exposure only after rendering a recognized variant. Missing
or disabled flags and failed requests retain the server-rendered control without
enrolling the visitor. An inline script gives the SDK and flag request a combined
500 ms budget before revealing control. If a recognized assignment arrives sooner,
it is applied while hidden. The copy fades in over 160 ms, with no animation for
reduced-motion users. Once revealed, neither late responses nor flag refreshes
change it or enroll the visitor in an unseen variant. The fallback works even if
the SDK is blocked; no-JS visitors see control immediately. This is a bounded
client-side wait, not server-side assignment or guaranteed instant variant rendering.

Primary metric: **Installer download conversion**, a funnel from experiment
exposure to `marketing_download_started` within **7 days**. The event is sent only
when an available installer is initiated on the install page (automatic start or
manual retry), not when opening a platform picker or email modal. It measures
download starts, not successful downloads or installations.

The download starts before the optional Cloud signup popup appears (after an
800 ms pause). The old `marketing_download_modal_opened` and
`marketing_download_modal_continued` events are retired. They described the
previous email step before downloading and should not be combined with the new
popup events.

Cloud signup events share `source` (`download` or `cloud`), `surface`
(`download_popup` or `homepage_dialog`), and `page_path`. Download popup events
also include `installer_id`.

| Event                                    | When it fires                                                              | Additional properties                                                                                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `marketing_cloud_signup_viewed`          | After the popup actually opens; a download retry does not reopen it        | —                                                                                                                                                        |
| `marketing_waitlist_started`             | First non-empty email input per opening; focusing/autofocus does not count | —                                                                                                                                                        |
| `marketing_waitlist_submit_attempted`    | Each submit attempt, including native email validation failures            | —                                                                                                                                                        |
| `marketing_waitlist_failed`              | Failed attempt                                                             | `reason`: `missing_email`, `invalid_email`, `verification_required`, `rate_limited`, `server_error`, `rejected`, `timeout`, `network_error`              |
| `marketing_waitlist_verification_failed` | Verification setup or challenge fails, once per reason per page            | `reason`: `unavailable`, `load_failed`, `challenge_failed`                                                                                               |
| `marketing_waitlist_submitted`           | Signup API accepts the request                                             | —                                                                                                                                                        |
| `marketing_cloud_signup_dismissed`       | Popup closes, including after a successful signup                          | `method`: `close_button`, `continue_to_installation`, `escape`, `backdrop`, `other`; `signup_state`: `not_started`, `started`, `submitting`, `submitted` |

Use `marketing_download_started` → `marketing_cloud_signup_viewed` →
`marketing_waitlist_started` → `marketing_waitlist_submit_attempted` →
`marketing_waitlist_submitted` for the post-download funnel, filtering signup
events to `source: download`. Break down dismissals by `method` and
`signup_state`; a dismissal after `submitted` is not abandonment. Failure reasons
are fixed categories; emails, verification tokens and raw error messages are
never included. Local previews do not send these events.

Secondary metric: **Accepted waitlist signup conversion**, exposure to
`marketing_waitlist_submitted` within **7 days**. This is a successful signup API
response from either the download or Cloud form; it is not email confirmation,
and repeated signup requests can emit repeated events. Funnel metrics count users
who convert rather than the number of attempts. Event definitions are created
without sending synthetic production events.

Keep the experiment as a **draft until this code is deployed**, then launch it in
PostHog. Local previews can force each copy variant without collecting data:

```text
http://127.0.0.1:4321/?copy_variant=control
http://127.0.0.1:4321/?copy_variant=customer-issues
http://127.0.0.1:4321/?copy_variant=skip-the-joins
```

The override is ignored on the deployed site. Use PostHog's experiment results
for conversion comparisons and replay filters for individual variants.

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
Continue with an email saves a pending Cloud waitlist signup and sends a
confirmation link before continuing to the chosen installer. Skip (or an empty
email) goes straight to the download without submitting anything. If signup
fails, the modal offers retry and Skip. Without JavaScript, download links work
directly. Email confirmation is independent of downloading.
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
pnpm --filter @quory/marketing test:worker
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

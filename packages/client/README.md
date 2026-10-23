# Quory electron client

[Read the docs here](https://github.com/CNimmo16/quory)

The renderer uses Tailwind CSS 3 and local shadcn/ui components in
`src/renderer/src/components/ui`. Theme tokens live in `src/renderer/src/index.css`;
`components.json` configures shadcn's renderer aliases. The components are adapted
from the [shadcn v3 registry](https://v3.shadcn.com/) and retain its MIT license.

From the workspace root:

```sh
pnpm --filter @quory/client serve
pnpm --filter @quory/client build
pnpm --filter @quory/client typecheck
pnpm --filter @quory/client test
```

The development server reloads renderer changes and restarts Electron when main
process or preload code changes. A restart clears unsaved forms. Restart any
development server launched before this watch option was enabled to pick it up.

The interaction tests cover connection forms, searchable table selection, filter
editing, and applying or dismissing column selections.

## PostHog

Packaged builds send uncaught main-process and renderer JavaScript exceptions,
unhandled promise rejections, and errors caught by the React router to PostHog EU.
The development server and tests do not initialize telemetry; previewing a
production renderer build does. Native crashes and handled
database/IPC errors are not automatically reported. The public project token and
ingestion endpoint live in `src/shared/telemetry.ts`.

Enable **Session Replay** in the matching PostHog project's settings. The renderer
bundles the recorder and exception extension locally, without permitting remote
scripts in Electron's content security policy. Replay masks all text and input
values, including query results and SQL, and redacts tooltip/accessibility text.
Console, network body/header, and canvas recording are disabled. Click and pageview
analytics are disabled. Error messages and stack traces are still captured.

Add these repository settings under **Settings → Secrets and variables → Actions**:

| Name | Type | Value |
| --- | --- | --- |
| `POSTHOG_CLI_API_KEY` | Secret | A PostHog **personal API key** with **Error tracking: Write** and **Organization: Read**, authorized for this project. |
| `POSTHOG_CLI_PROJECT_ID` | Variable | The numeric project ID from PostHog project settings (or `/project/<id>` in its URL). |

The public `phc_` token is already configured; it is not the personal upload key.
CI uses `https://eu.posthog.com` for uploads. Each platform builds hidden sourcemaps,
injects chunk IDs into the output, uploads the maps with the client release version,
and then packages that same output. Missing credentials or failed uploads fail the
release job. Maps are excluded from installers. No personal API key is available
to the app build or runtime.

After the first release, launch an installer, navigate the app, and verify a masked
recording in PostHog. In its renderer DevTools, run
`setTimeout(() => { throw new Error("Quory PostHog smoke test"); }, 0)` and check
Error Tracking for the exception and linked replay. An error thrown from DevTools
has no bundled source map; verify symbolication with an error originating in app
code. CI upload and live ingestion need the credentials/project settings above.

`posthog-node` is pinned to 5.10.0 for Electron 31's Node 20 runtime; newer releases
require a newer Node patch. Revisit the pin when upgrading Electron.

References: [sourcemap upload](https://posthog.com/docs/error-tracking/upload-source-maps/cli),
[bundling SDK extensions for Electron](https://posthog.com/docs/libraries/js), and
[replay privacy](https://posthog.com/docs/session-replay/privacy).

## Desktop icons

macOS packaging requires Xcode 26 or newer, selected with `xcode-select`. Release
CI selects Xcode 26.3 on both Mac runners. electron-builder 26 compiles
`build/Quory.icon` into the native asset catalog and an ICNS fallback, so macOS 26
can apply its standard icon shape and appearance variants. Older Macs use the
fallback. Windows and Linux continue using `build/icon.ico` and `build/icon.png`.

The Apple Silicon release runner uses macOS 26 to avoid an Xcode asset runtime
crash on macOS 15. The Intel runner remains on macOS 15. Windows uses the
Windows 2022 runner with Visual Studio 2022, supported by the pinned node-gyp.
The optional `cpu-features` optimization is rebuilt when installed; missing it
does not prevent SSH or packaging from working.

Edit the macOS document in Apple's Icon Composer. Keep the white background
separate from the teal mark. After changing it, regenerate the committed disk
image and development Dock assets from the client directory:

```sh
pnpm exec node scripts/generate-mac-icon.cjs
```

The release smoke test checks the asset catalog, fallback, bundle icon reference,
native modules, and ad-hoc signature. No Apple signing account or notarization
credentials are required.

## Query assistant

Open **Settings** from the app toolbar or press **⌘,** on macOS / **Ctrl+,** on
Windows and Linux. Settings are local to this device and available before opening
a project. In **AI**, choose OpenAI, Anthropic, Google, or a custom OpenAI-compatible
endpoint. Each provider remembers its selected model and encrypted key; switching
providers does not require entering saved keys again. Save to activate the selected
provider, then use **Test connection** to make a small provider request. Provider
usage, including the connection test, may incur charges. Saved keys are encrypted
using Electron safeStorage and are never returned to the renderer. On Linux,
saving keys requires a supported system secret service; plaintext fallback is
refused. Removing a saved key falls back to an environment key if one is present.

The model dropdown loads live tool-capable text models from [models.dev](https://models.dev)
before a key is configured. With credentials, it queries the provider's own model
API instead. **Refresh models** uses the entered key (if any) or that provider's
saved key; no credentials are sent to models.dev. Catalogue results are cached for
15 minutes, and account access may differ. **Enter a model ID manually…** remains
available if discovery is offline, unsupported, or missing a model.

For custom providers, enter the API base URL (for example
`http://localhost:1234/v1`). Model discovery calls its `/models` endpoint, and AI
requests use `/chat/completions`. Keys are optional for unauthenticated local
servers and are stored separately for each endpoint URL. Changing the URL never
forwards a different endpoint's saved key. Models must support tool calling for
the query assistant.

**Appearance** controls system/light/dark theme, SQL editor font size, and results
density. **Privacy & diagnostics** independently controls analytics (including
masked replay) and error reports, opens the logs folder, and copies a restricted
set of app/runtime information. **About** shows the installed version and links
to releases, documentation, and issue reporting. Update checks open the latest
GitHub release; installation is manual.

Copy the root `.env.example` to `.env.local` and set `AI_PROVIDER`, `AI_MODEL`,
and the corresponding key. Supported providers are `openai` (`OPENAI_API_KEY`
or `OPEN_AI_API_KEY`), `anthropic` (`ANTHROPIC_API_KEY`), and `google`
(`GOOGLE_GENERATIVE_AI_API_KEY`). For `custom`, set `AI_BASE_URL` and optionally
`CUSTOM_OPENAI_API_KEY`. `AI_MODEL` is the provider's model ID, without a provider
prefix. Choose a model with tool calling support. Changes made in Settings apply
immediately; restart Electron after changing environment variables. Packaged apps read these settings from the process environment;
development loads the root `.env.local` without overriding existing environment variables.

The Vercel AI SDK runs in Electron's main process. Provider adapters are isolated
in `src/main/ai/model.ts`; the query assistant and `upsert_query` tool are shared
across providers. The settings form sends entered keys to the main process for
saving or explicitly refreshing the model list; saved keys are never returned to the renderer. The provider receives the
database schema, chat, and current query, including filter values, but no result rows
or database connection credentials.

Describe a query on the launch screen, answer any clarification in the left chat,
then amend the saved query in that same chat. Tool arguments are checked against
the schema and compiled by the existing query engine before saving. Chat updates
save automatically, including the conversation; clarification before an update
stays in memory. Manual mode remains available without an AI key. Unsaved manual
edits are included in the next chat amendment. The assistant supports the existing
builder's read-only queries, not arbitrary SQL or database writes.

## Projects and environments

The app opens at project selection. Each project owns its saved queries and can
have multiple named connections, such as Local, Staging, and Production. Queries
are shared between those connections. Switching projects disconnects the current
connection; deleting a connection leaves the project's queries intact. Existing
connections and queries are migrated into an **Imported project** on first launch.

When creating a project, choose either Quory's local app database or a project
folder. **Browse…** opens the native directory picker. Select a repository folder
or an existing `.quory` directory directly. Existing query files are loaded, and
selecting the same folder again opens its existing local project registration.
A cloned repository can have its own local connections.

Folder projects use this layout:

```text
.quory/
  project.json
  .gitignore
  queries/
    <query-id>.json
```

Each query file contains `version: 1`, `id`, `nickname`, and the usual `base`,
`limit`, and `offset` query fields. A file's `id` matches its filename without
`.json`; IDs may contain letters, digits, underscores, and hyphens. Hand-authored
files can omit `id`, `version`, `limit`, and `offset`. Commit `.quory` to share
query definitions. Connection credentials, chat conversations, and edit history
stay in the local app database.

The saved-query list refreshes folder files while a project is open. Opening a
query reads its latest contents. Saves use atomic file replacement and reject
stale revisions if another editor or Git has changed the file. Reopen a query to
load external changes before saving. Invalid JSON reports the affected filename
without replacing the file.

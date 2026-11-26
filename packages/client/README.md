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

Renderer changes hot-reload in the existing Electron window. Restart `pnpm serve`
to pick up main process or preload changes.

The interaction tests cover connection forms, searchable table selection, filter
editing, and applying or dismissing column selections.

## Project relationships

Open **Project configuration** while creating a project, or from a project's right-click menu in the sidebar. Inference is off by default. Each project can configure cross-schema matching, plural conversion, ambiguity handling, exact type matching and a minimum relationship confidence. These settings apply to every connection in that project, including schema refresh, query results, counts and the assistant.

Exclude incorrect inferred relationships in configuration or by clicking a dashed relationship edge in the table navigator. Restore exclusions in configuration. Add manual relationships there using compatible column pairs that reference the destination's complete primary key. These changes update project metadata without changing database constraints. Project configuration is saved in Quory's local project record, including for folder-backed projects.

When a requested join has no relationship but its columns suggest a valid primary-key reference, the assistant proposes adding it to the project. Confirm the proposal with **Add relationship and continue**, or reply “yes”; the assistant then adds the relationship and continues the original query. Existing exclusions and confidence limits are respected.

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

| Name                     | Type     | Value                                                                                                                  |
| ------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| `POSTHOG_CLI_API_KEY`    | Secret   | A PostHog **personal API key** with **Error tracking: Write** and **Organization: Read**, authorized for this project. |
| `POSTHOG_CLI_PROJECT_ID` | Variable | The numeric project ID from PostHog project settings (or `/project/<id>` in its URL).                                  |

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
a project. **AI** has separate sections for **Provider connections**, **AI assistant
model**, and **Decision model**. Save a provider key once and reuse it for either
role. Provider connections are listed with a visible credential status and an
expandable editor for each provider. Saving credentials never switches a model. Existing keys and assistant
selections migrate automatically. Decision models are disabled until selected.

Assistant providers are OpenAI, Anthropic, Google, and custom OpenAI-compatible
endpoints. Decision providers are OpenAI, Google, TypeSafe / Jev, and Cloudflare. Each role has
its own save and connection-test buttons. Tests make a small provider request and
may incur charges. Saved keys are encrypted using Electron safeStorage and are
never returned to the renderer. On Linux, saving keys requires a supported system
secret service; plaintext fallback is refused. Removing a saved key falls back to
an environment key if one is present.

The assistant model dropdown loads tool-capable text models from
[models.dev](https://models.dev) before a key is configured. With credentials, it
queries the provider's model API instead. Refresh uses the saved provider
connection; save a replacement key first. No credentials are sent to models.dev.
Catalogue results are cached for 15 minutes, and account access may differ.
**Enter a model ID manually…** remains available for assistant models.

Native decision support was checked against provider documentation on 2026-11-13:

| Provider   | Decision models                                         | API                                                                              |
| ---------- | ------------------------------------------------------- | -------------------------------------------------------------------------------- |
| OpenAI     | `gpt-6-luna`                                            | [`POST /v1/decisions`](https://developers.openai.com/api/docs/guides/decisions)  |
| Google     | `gemini-decision-1`                                     | [`POST /v1beta/decisions`](https://ai.google.dev/gemini-api/docs/decisions-api)  |
| TypeSafe   | `jev-latest`, `jev-preview`, `jev-1.14.0`, `jev-1.13.0` | [`POST /v1/systemone`](https://docs.typesafe.ai/models)                          |
| Cloudflare | `@cf/cloudflare/clef`, `@cf/cloudflare/clef-flash`      | [Workers AI REST API](https://developers.cloudflare.com/workers-ai/models/clef/) |
| Anthropic  | No documented native decision API found                 | [API overview](https://platform.claude.com/docs/en/api/overview)                 |
| Custom     | Chat compatibility does not establish decision support  | Assistant only                                                                   |

OpenAI, Google, and Cloudflare decision lists use documented supported IDs, rather than assuming
that every chat model supports decisions. TypeSafe also loads its authenticated
model list, retaining documented pinned versions; offline discovery falls back to
the documented list. Test the saved selection to confirm account access.

Cloudflare requires an account ID and a Workers AI API token with Read and Edit
permissions. Save both in its provider editor, or supply `CLOUDFLARE_ACCOUNT_ID`
and `CLOUDFLARE_API_TOKEN` (`CLOUDFLARE_AUTH_TOKEN` is also accepted). Tokens use the
same encrypted storage as other provider keys. Clef requests use the account-scoped
Workers AI endpoint and are limited to 64 questions per request. Cloudflare is
currently available for the decision role only.

`src/main/ai/decisions.ts` provides a text-only interface for batched predicates,
choices, and rubric scores, with validated responses, bounded requests, timeouts,
and sanitized failures. When a decision model is enabled, joining tables uses
local shortlists of at most 32 candidates, then scores them with the saved model.
The table list retains all reachable tables for searching. Tables with one direct
relationship skip path selection; other selections offer up to three ranked exact
paths, with a custom path option. Once a path is chosen, the decision model selects
a concise set of destination columns from a shortlist of at most 32, considering
the current selected columns and relationship path. It selects at most eight
columns; disabled, invalid, or unavailable decisions fall back to up to six useful
columns locally. Column selection waits at most three seconds and can be canceled.
Existing table instances and their selections are preserved. Requests contain
schema metadata (table and column names/types, relationship columns, and the
currently joined tables), never row values, filter literals, or SQL. Decisions are cached for five
minutes per connection, settings revision, and candidate context. Disabled or
unavailable models leave local suggestions usable. Provider connection tests use
synthetic text, not database metadata.

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
(`GOOGLE_GENERATIVE_AI_API_KEY`, or `GEMINI_API_KEY`). TypeSafe credentials can be
provided using `TYPESAFE_API_KEY`; select its decision model in Settings. For `custom`, set `AI_BASE_URL` and optionally
`CUSTOM_OPENAI_API_KEY`. `AI_MODEL` is the provider's model ID, without a provider
prefix. Choose a model with tool calling support. Changes made in Settings apply
immediately; restart Electron after changing environment variables. Packaged apps read these settings from the process environment;
development loads the root `.env.local` without overriding existing environment variables.

The Vercel AI SDK runs in Electron's main process. Provider adapters are isolated
in `src/main/ai/model.ts`; the query assistant and `upsert_query` tool are shared
across providers. The settings form sends entered keys to the main process for
saving; saved keys are never returned to the renderer. The provider receives the
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

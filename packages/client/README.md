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

## Query assistant

Copy the root `.env.example` to `.env.local` and set `AI_PROVIDER`, `AI_MODEL`,
and the corresponding key. Supported providers are `openai` (`OPENAI_API_KEY`
or `OPEN_AI_API_KEY`), `anthropic` (`ANTHROPIC_API_KEY`), and `google`
(`GOOGLE_GENERATIVE_AI_API_KEY`). `AI_MODEL` is the provider's model ID, without a
provider prefix. Choose a model with tool calling support. Restart Electron after
changing settings. Packaged apps read these settings from the process environment;
development loads the root `.env.local` without overriding existing environment variables.

The Vercel AI SDK runs in Electron's main process. Provider adapters are isolated
in `src/main/ai/model.ts`; the query assistant and `upsert_query` tool are shared
across providers. API keys never enter the renderer. The provider receives the
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

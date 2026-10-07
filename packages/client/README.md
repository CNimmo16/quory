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

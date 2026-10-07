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

The interaction tests cover connection forms, searchable table selection, filter
editing, and applying or dismissing column selections.

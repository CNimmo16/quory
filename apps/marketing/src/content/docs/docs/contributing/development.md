---
title: "Run Quory from source"
description: "Set up the monorepo, run the desktop app, and edit the documentation site."
sidebar:
  order: 1
---

The repository contains the core engine, database drivers, stack integration, Electron client, and this Astro marketing site.

## Set up the workspace

Use pnpm **12.10.1**, the version pinned in the root `package.json`. `pnpm install` downloads and uses the pinned Node.js **20.20.2** runtime, including for native dependency builds. Run project commands through pnpm.

```sh
git clone https://github.com/CNimmo16/quory.git
cd quory
pnpm install
pnpm build
```

Build once before starting watch mode so dependent packages can resolve their built dependencies.

## Run the desktop app

In one terminal, rebuild library packages as you edit:

```sh
pnpm dev
```

In another, launch Electron:

```sh
pnpm serve
```

The client development server reloads renderer changes and restarts Electron for main-process or preload changes. A restart clears unsaved forms.

The launcher checks Electron and its native bindings, restoring or rebuilding them when needed. To rebuild bindings manually:

```sh
pnpm rebuild:native
```

A plain `pnpm rebuild` targets Node.js. If you rebuild modules for Node.js tests, rebuild for Electron again before launching the desktop app.

## Build an installer

```sh
pnpm build
pnpm --filter @quory/client build:mac
```

Replace `mac` with `linux` or `win` for your operating system. Outputs go to `packages/client/dist`. Use `build:unpack` for an unpacked application.

## Run checks

```sh
pnpm test
pnpm lint
```

Build the packages first. MySQL and PostgreSQL integration tests require Docker. To check a single package, use commands such as `pnpm --filter @quory/core test` or `pnpm --filter @quory/client typecheck`.

## Edit the docs

```sh
pnpm marketing:dev
```

Open `http://127.0.0.1:4321/docs/`. Documentation pages live in `apps/marketing/src/content/docs/docs/`; the extra `docs` directory places Starlight at `/docs/` while the marketing homepage stays at `/`.

Each Markdown or MDX page has a title, description, and sidebar order in its frontmatter. Add task-focused guides to the relevant client, core, stack, or drivers directory. The sidebar groups are configured in `apps/marketing/astro.config.mjs`.

```sh
pnpm marketing:build
pnpm marketing:start
```

The build checks Astro types, generates static pages, and builds the search index. Search is available in the production preview. Styling lives in `src/styles/docs.css`, with colours mapped from the shared Quory palette in `src/components/docs/Head.astro`.

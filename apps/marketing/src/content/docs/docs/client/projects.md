---
title: "Projects and environments"
description: "Organise saved queries, switch database environments, and share folder projects through Git."
sidebar:
  order: 2
---

A project owns its saved queries and can have several named connections. Use one project for a shared schema and connections such as Local, Staging, and Production.

## Switch environments

Queries belong to the project rather than a single connection. Switching connections lets you run the same query against another environment with a compatible schema. Check the selected connection before running it: a query that works locally may need tables or columns that have not yet reached production.

Switching projects disconnects the current connection. Deleting a connection leaves that project's saved queries intact. Older installations migrate existing connections and queries into an **Imported project**.

## Choose where queries live

**Local projects** store their query definitions in Quory's app-local database. Use this for personal investigations that do not need version control.

**Folder projects** store definitions in a `.quory` directory. When creating a project, use **Browse…** to select a repository folder or an existing `.quory` directory. Existing query files are loaded; selecting the same folder again opens its local project registration.

```text
.quory/
  project.json
  .gitignore
  queries/
    <query-id>.json
```

Commit this directory to share query definitions. Each developer can clone it and configure their own local connections.

## What is shared?

| Stored in the project folder                                    | Kept in the local app database                  |
| --------------------------------------------------------------- | ----------------------------------------------- |
| Project metadata and saved query definitions                    | Connection credentials                          |
| Query names, selected columns, relationships, and saved filters | Assistant conversations and edit history        |
|                                                                 | Named filtersets, including for folder projects |

Review query definitions before committing them: their filter values can contain customer details. Keeping connection credentials local does not remove sensitive values from a query you save.

## Work alongside Git or another editor

The saved-query list refreshes folder files while the project is open. Opening a query reads its latest contents. If a file changes externally while you edit, Quory rejects a stale save; reopen the query to load the current definition before saving again.

Invalid JSON reports the affected filename without replacing the file. Saves use atomic file replacement.

Hand-authored relationship query files can omit `id`, `version`, `limit`, and `offset`. If an ID is present, it must match the filename without `.json` and use letters, digits, underscores, or hyphens. Prefer creating the initial query in the app, then reviewing its JSON in Git.

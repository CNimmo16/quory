---
title: "Install and connect"
description: "Install the Quory desktop client and make your first database connection."
sidebar:
  order: 1
---

The desktop client is the quickest way to use Quory without writing code. It runs locally as an Electron application.

## Install Quory

Open [Downloads](/downloads/) and choose the build for your operating system and architecture. The [GitHub releases page](https://github.com/CNimmo16/quory/releases/latest) lists the available files and release notes.

- **Windows:** run the `.exe` installer.
- **macOS:** open the `.dmg` and move Quory to Applications, or extract a matching macOS `.zip`.
- **Linux:** use the `.AppImage`, or a distribution-specific package when one is available. You may need to mark an AppImage executable before opening it.

Use an asset that matches your machine; do not assume every release includes every architecture.

If macOS blocks an unsigned build you downloaded from the project's release page, the repository's installation instructions use `xattr -c /Applications/Quory.app` to clear its extended attributes. Only do this for a build you trust. You can also [build the client from source](/docs/contributing/development/).

## Create a project

A project groups saved queries and named database connections. Create one for the application or dataset you investigate. Choose local storage to keep query definitions in Quory, or choose a folder if you want to share them through Git.

See [projects and environments](/docs/client/projects/) for the storage choices and how they affect collaboration.

## Add a connection

Select PostgreSQL, MySQL, or SQLite in the connection form.

For PostgreSQL or MySQL, enter the host, port, database name, username, and password. For SQLite, choose the database file. Give the connection a recognisable nickname such as **Local**, **Staging**, or **Production**; a connection colour helps distinguish environments.

For remote databases, configure SSL to match your database provider. See [database connections](/docs/drivers/databases/#tls-in-the-client-and-stack) for the difference between encryption and certificate verification.

Keep **Write protection** set to **Read only** for an investigation connection. Prefer a database account restricted to the tables you need.

## Make your first query

Select the project and connection, then start a manual relationship query. Pick a base table, show a few useful columns, and filter to one known record. Add a related table to bring its records into view.

You can also describe the query in natural language after configuring the optional [query assistant](/docs/client/assistant/).

Continue with [exploring related records](/docs/client/queries/).

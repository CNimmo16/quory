# Quory

The open source database client for support engineers.

## Why do I need this?

Quory was created out of frustration at the way most database clients handle querying relationships.

In general, database clients are designed for two things: **managing databases** and **analyzing data**. But if you commonly work on debugging individual customer queries, especially at small companies without much internal tooling, you'll know about another use case:

**"Show me all the relevant information that I need to solve this particular query, even if that information is stored across multiple database tables."**

Quory is a database client focused on this use case, helping you to find the data you need to help your customers as quickly as possible.

> At its core, Quory is also a collection of Typescript functions for joining tables without writing SQL. [Find out about using Quory to build data apps.](#building-your-own-data-app-quorycore-)

## Getting started

Quory is distributed as an Electron app for all major operating systems.

Windows, Mac and Linux installers can be found here https://github.com/CNimmo16/quory/releases/latest.

### Which installer to pick?

If you're unsure which file to download from the release, here is some guidance:

- On Windows, download the `quory-{version}-setup.exe` and follow the installer instructions.
- For Linux, download the `quory-{version}.AppImage` file, or a specific file for your distro if it isn't compatible with AppImage.
- On Mac OS, either:
  - download the `quory-{version}.dmg` file to install Quory to the Applications folder
  - download the `quory-{version}-arm64-mac.zip`, extract the zip file, and use it to run Quory directly
    > For Mac OS, you'll need to run `xattr -c <path/to/application.app>` from the terminal after installing the app. This is because the app is unsigned (as I do not have an Apple developer account). If you'd prefer to build from source, [see "Building the electron client"](#building-the-electron-client).

## Quory Cloud (coming soon!)

Working in a team? With [Quory cloud](TODO) you can setup an affordable, fully managed Quory deployment in seconds, with access to cloud-exclusive features, including row and column level access control, integrations with customer support tools like Intercom, and support for additional data sources.

## Other ways to use Quory

### Integrating a Quory client within an existing Javascript web app (@quory/stack) [![npm version](https://badge.fury.io/js/@quory%2Fstack.svg)](https://badge.fury.io/js/@quory%2Fstack)

This option is for those who need a Quory client to sit on a page within their existing Javascript-based web application, either because:

- You want it to be deployed in a subdirectory of your existing server
- You need the client to be rendered within an existing webpage, without the use of an `<iframe>`
- You want to deploy Quory as a serverless app (we recommend [Quory cloud](TODO) instead for this use case to get managed updates and access to additional features)

Currently only React is supported for the frontend.

#### Installation

Install the `@quory/stack` module, as well as the dedicated driver for the database you will be interacting with.

Eg.

```
npm install @quory/stack @quory/postgres --save
```

Available drivers:

- `@quory/postgres`
- `@quory/mysql`
- `@quory/sqlite`

Need a driver not yet on this list? See [contributing](CONTRIBUTING.md).

#### Setup

In your backend code, configure a Quory request handler for your project, specifying your database connection and any other configuration parameters you'd like to specify.

```ts
import { makeQuoryRequestHandler } from "@quory/stack";

const handleQuoryRequest = makeQuoryRequestHandler({
  database: {
    hostOrFilePath: "localhost",
    type: "postgres",
    database: "postgres",
    port: 5432,
    username: "postgres",
    password: "postgres",
  },
});
```

Now add an API route to handle POST requests from the frontend. The route should call the request handler from above, passing the JSON-parsed request body as the only argument.

For example, in express:

```ts
app.use(express.json());
app.post("/quory", async (req, res) => {
  try {
    const ret = await handleQuoryRequest(req.body);
    res.json(ret);
  } catch (error) {
    console.error(error);
  }
});
```

Now on the frontend, start by wrapping your React application with the `<QuoryProvider />`. This provides the configuration needed for Quory to fetch data from the backend

```tsx
import { QuoryProvider } from "@quory/stack/react";

export default function MyApp() {
  return (
    <QuoryProvider
      endpointUrl="http://localhost:3000/quory" // the URL from the post request configured above
    >
      ...
    </QuoryProvider>
  );
}
```

<!-- TODO: document this better -->

You now have access to several hooks importable from `@quory/stack/react`

- `useQuery` - fetch data for a Quory query from the backend

```ts
const [_query, setQuery] = useState({
  base: {
    tableRef: "public.users",
    select: "*",
  },
});
const { query, data, error, isLoading, joinActions } = useQuery(
  _query,
  setQuery,
);
```

- `useQueryCount` - fetch only the total items count for a Quory query

```ts
const { query, data, error, isLoading, joinActions } = useQueryCount({
  tableRef: "public.books",
  select: ["name", "author_id"],
});
```

- `useFetchSchema` - fetch the database schema information from the backend

```ts
const { data: schemaData } = useFetchSchema();
```

### Building your own data app (@quory/core) [![npm version](https://badge.fury.io/js/@quory%2Fcore.svg)](https://badge.fury.io/js/@quory%2Fcore)

If you are building a data app, or want to interact with your own database directly, consider `@quory/core`. This is the package which powers Quory's auto-joining magic under the hood.

It provides a set of functions to obtain information about your database's schema and relationships, as well as a query builder to instantly fetch data from across multiple tables via a single SQL query, without the need to specify how to join the tables.

[Read the docs for Quory core](/packages/core/README.md)

## Local development

### Prerequisites

- pnpm 12.10.1 (the version pinned in `package.json`). Install pnpm using the [official installation instructions](https://pnpm.io/installation).
- `pnpm install` automatically downloads and uses the Node.js 20.20.2 runtime pinned in `package.json`, including for native dependency builds. Run project commands through pnpm so they use this runtime even if your shell has another Node.js version.
- Docker for the MySQL and PostgreSQL integration tests.

### Setup

1. Clone the repo
2. Run `pnpm install`
3. Run `pnpm build` to build all packages in dependency order.

#### Building packages

Run `pnpm build` for a one-off build, or `pnpm dev` to run the `build:watch` scripts concurrently from all packages in the `/packages` folder. Build once before starting watch mode so dependent packages can resolve their dependencies.

#### Running Electron client locally

Run `pnpm serve` to launch the Electron app locally. Keep `pnpm dev` running in a separate terminal to rebuild the library packages as you edit them.

`pnpm serve` and the client preview check that Electron is installed and that its native bindings load before launching. They restore a missing runtime and rebuild incompatible bindings automatically after dependency reinstalls. To rebuild the bindings manually, run `pnpm rebuild:native`. This rebuilds the database and SSH native modules for the client's pinned Electron version and your current architecture. A plain `pnpm rebuild` targets Node.js instead; after rebuilding modules for Node.js tests, run `pnpm rebuild:native` before launching Electron.

#### MySQL Sakila sample database

With Docker running (including the Docker Compose plugin), run `pnpm sakila:up` to start MySQL 8.4 with the [official Sakila sample database](https://dev.mysql.com/doc/sakila/en/). The command waits until the import is complete and MySQL is ready. The first run pulls the MySQL image; subsequent starts reuse the database volume.

Create a MySQL connection in Quory with:

| Setting  | Value       |
| -------- | ----------- |
| Host     | `127.0.0.1` |
| Port     | `3307`      |
| Database | `sakila`    |
| Username | `quory`     |
| Password | `quory`     |

The port is bound only to localhost. To use a different port, run `SAKILA_PORT=3308 pnpm sakila:up` and enter that port in Quory. These credentials are for local development; the container's root password is `sakila-root`.

- `pnpm sakila:down` stops the database and keeps your data.
- `pnpm sakila:up` starts it again with your changes preserved.
- `pnpm sakila:reset` **deletes the Sakila volume and all changes**, then recreates the original sample database. Use this to retry a failed first import too.
- `pnpm sakila:logs` follows MySQL's logs.

Configuration lives in `compose.sakila.yml`. The compressed SQL fixtures in `docker/sakila/` are unmodified Sakila 1.5 schema and data from the [official archive](https://downloads.mysql.com/docs/sakila-db.tar.gz), downloaded on 2026-10-16 (archive SHA-256: `683e957d456341e48cccd66135ddb0d5701a8436523ed0a6366279f8e8719a68`). Their license is retained in the SQL headers and `docker/sakila/LICENSE`. Seeding runs only when the database volume is empty.

##### Load the sample project

The repository includes a ready-to-load [Sakila project](.quory/project.json) with six saved queries.

1. Run `pnpm sakila:up`.
2. In Quory, create a project named **Sakila**, choose **Project folder**, and browse to this repository (or its `.quory` directory).
3. Add a MySQL connection using the connection details above. Connections are stored locally in Quory and are not imported from the project folder.
4. Open a saved query from the project sidebar.

| Query                                | What it demonstrates                                                 |
| ------------------------------------ | -------------------------------------------------------------------- |
| Customers and addresses              | Customer → address → city → country relationships                    |
| Customer 1 - rental history          | A customer filter, rental history, inventory, and film details       |
| Academy Dinosaur - cast and category | Many-to-many relationships through `film_actor` and `film_category`  |
| Rentals since August 2005            | Date filtering, sorting, and customer, film, and staff relationships |
| Unreturned rentals before March 2006 | Custom SQL with a bound cutoff-date parameter                        |
| Most rented films by store           | Custom SQL aggregation with a bound store-ID parameter               |

The first four queries are editable in the relationship builder. The last two open in the SQL editor. Dates use Sakila's historical data so results remain useful regardless of today's date. Change the customer/film filters or SQL parameters to explore other records. Saving query edits updates `.quory/queries/` for review in Git.

#### Saved filtersets

In a saved relationship query, choose **Save current filters** in the Filters header to name the current filters. Recent filtersets appear in a single row as space allows; **View more** lists the rest. Choose a filterset to replace the current filters and return to the first results page while preserving columns, joins, and ordering. Applying a filterset is a normal query edit and can be undone.

Filtersets are scoped to a project and query and stored in the app-local PouchDB database under `userData/pouchdb/query-filtersets`, including for folder projects. Saving a filterset does not update the query definition in `.quory`. A filterset can be applied while its relationship tree still matches; if the tables or join paths have changed, restore that tree before applying it.

#### Building the Electron client

Run `pnpm build`, then `pnpm --filter @quory/client build:<os>` replacing `<os>` with your operating system - `mac`, `linux` or `win`. The resulting build files will be created in the `/packages/client/dist` folder. Use `pnpm --filter @quory/client build:unpack` to create an unpacked application.

#### Testing

After building the packages, run `pnpm test` from the root directory to run package tests concurrently, or `pnpm --filter @quory/<package-name> test` to run tests for a single package. Run `pnpm lint` to lint all packages.

#### Releases

Run `pnpm changeset` to build the packages and record a change for release. CI installs dependencies with `pnpm install --frozen-lockfile` and runs `pnpm ci:release` to build, lint, test, version, and publish through Changesets.

The release workflow uses npm trusted publishing through pnpm, without an `NPM_TOKEN` secret. Each public package (`@quory/client`, `@quory/core`, `@quory/mysql`, `@quory/postgres`, `@quory/sqlite`, and `@quory/stack`) must have a GitHub Actions trusted publisher configured on npm with owner `CNimmo16`, repository `quory`, workflow filename `release.yml`, and no environment name. The publisher must allow direct publishing (`npm publish`). A registry 404 during publishing can indicate a missing, expired, or mismatched trusted publisher; it does not necessarily mean the package is missing. See [npm's trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/).

The **Check npm trusted publishing** step checks the OIDC token exchange separately for every public package and reports npm's rejection before the build and publish command runs. Successful exchange confirms the workflow identity was accepted; it does not verify permission to publish directly rather than stage a release. Tokens are never logged or saved.

Desktop publishing can recover after npm has already released a version. On each
successful push run, CI checks the current client version's GitHub release and
rebuilds its desktop installers if any installer, `downloads.json`, or
`SHA256SUMS.txt` is missing. Complete releases are skipped. Builds always check out
the existing `@quory/client@<version>` tag, using the workflow's current runner and
environment configuration.

To retry a specific release without running npm publishing, open **Actions →
Release → Run workflow**, select `main`, and enter `client_version` (for example
`1.0.10`). The equivalent command is:

```sh
gh workflow run release.yml --ref main -f client_version=1.0.10
```

This requires an existing stable GitHub release and rebuilds all four platform
targets, uploads the complete installer set, and then updates the website
manifest. Use this manual path to retry manifest promotion even if all release
assets were already uploaded. It does not publish npm packages or bump versions.

## Marketing website

The static Astro marketing site lives in [`apps/marketing`](apps/marketing/README.md). Run `pnpm marketing:dev` to start it at http://127.0.0.1:4321. Edit marketing copy in its Astro pages and shared layout. The Starlight documentation is at `/docs/`, with Markdown and MDX guides in [`apps/marketing/src/content/docs/docs`](apps/marketing/src/content/docs/docs).

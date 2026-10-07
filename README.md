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
      tableRef: 'public.users',
      select: '*',
    }
  })
  const { query, data, error, isLoading, joinActions } = useQuery(
    _query,
    setQuery
  );
```

- `useQueryCount` - fetch only the total items count for a Quory query

```ts
  const { query, data, error, isLoading, joinActions } = useQueryCount({
    tableRef: 'public.books',
    select: ['name', 'author_id'],
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

#### Building the Electron client
Run `pnpm build`, then `pnpm --filter @quory/client build:<os>` replacing `<os>` with your operating system - `mac`, `linux` or `win`. The resulting build files will be created in the `/packages/client/dist` folder. Use `pnpm --filter @quory/client build:unpack` to create an unpacked application.

#### Testing
After building the packages, run `pnpm test` from the root directory to run package tests concurrently, or `pnpm --filter @quory/<package-name> test` to run tests for a single package. Run `pnpm lint` to lint all packages.

#### Releases
Run `pnpm changeset` to build the packages and record a change for release. CI installs dependencies with `pnpm install --frozen-lockfile` and runs `pnpm ci:release` to build, lint, test, version, and publish through Changesets.

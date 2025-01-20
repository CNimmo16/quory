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

### Setup

1. Clone the repo
2. Run `npm install`

#### Building packages
Run `npm run dev` to run the `build:watch` scripts from all packages in the /packages folder. Note: this script may error when first run, if so just run it a second time.

#### Running Electron client locally
Run `npx turbo serve` to run the `serve` script from the `/packages/client/package.json`, which should launch the Electron app locally.

#### Building the Electron client
Run `npx turbo build:<os>` replacing `<os>` with your operating system - `mac`, `linux` or `windows`. The resulting build files will be created in the `/packages/client/dist` folder.

#### Testing
Each of the packages has a suite of tests, these can be run simultaneously by running `npm run test` from the root directory, or run `npm run test --workspace @quory/<package-name>` to run tests for a single package.

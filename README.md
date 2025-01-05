# Quory

The open source database client for support engineers.

## Why do I need this?

Quory was created out of frustration at the way most database clients handle querying relationships.

In general, database clients are designed for two things: **managing databases** and **analyzing data**. But if you commonly work on debugging individual customer queries, especially at small companies without much internal tooling, you'll know about another use case:

**"Show me all the relevant information that I need to solve this particular query, even if that information is stored across multiple database tables."**

Quory is a database client focused on this use case, helping you to find the data you need to help your customers as quickly as possible.

> At its core, Quory is also a collection of Typescript functions for joining tables without writing SQL. [Find out about using Quory to build data apps.](#using-quory-to-build-your-own-data-app-quorycore-npm-version)

## Getting started (Docker image)

In this guide you will launch a prebuilt Quory instance using Docker, this is the fastest way to setup Quory locally and begin querying your database. Alternatively, find out how to [deploy Quory](#deployment) or [integrate Quory into your web app](#integrating-a-quory-client-within-an-existing-javascript-web-app-quorystack-npm-version).

### Prerequisites

Make sure you have Docker installed.

### Option 1: `docker run`

Simply run `docker run -p 8080:8080 -e QUORY_DEV_MODE=1 -e QUORY_DB_TYPE=<database-type> -e QUORY_DB_HOST=<database-host> -e QUORY_DB_PORT=<database-port> -e QUORY_DB_USER=<database-user> -e QUORY_DB_PASSWORD=<database-password> quory`, replacing the environment values with relevant values for your database

### Option 2: Docker compose

Copy the below config into a `docker-compose.yml` file and run `docker compose up`.

```yml
services:
  quory:
    image: quory
    ports:
      - "8080:8080"
    environment:
      QUORY_DEV_MODE: 1
      QUORY_DB_TYPE: ""
      QUORY_DB_HOST: ""
      QUORY_DB_PORT: ""
      QUORY_DB_USER: ""
      QUORY_DB_PASSWORD: "" # (optional)
      QUORY_DB_DATABASE: "" # (optional)
```

## Deployment

If you are already using docker compose for deployment, deploying is as simple as adding the quory service to your compose file updating your environment variables as follows:

1. Set the `QUORY_DEV_MODE` variable to 0 to protect your Quory instance via basic auth.
2. Set the `QUORY_UI_USER` and `QUORY_UI_PASSWORD` variables to configure credentials for basic auth.

Alternatively you may:

- Use [Quory cloud](TODO) to get an affordable, fully managed Quory deployment running in seconds, as well as access to cloud-exclusive features, including row and column level access control, integrations with customer support tools like Intercom, and support for additional data sources.
- Use Render, Heroku, AWS Elastic Beanstalk, Google App Engine etc. to deploy the standalone docker image.
- Integrate Quory within your existing application by following [the guide below](#integrating-a-quory-client-within-an-existing-javascript-web-app-quorystack-npm-version).

## Integrating a Quory client within an existing Javascript web app (@quory/stack) [![npm version](https://badge.fury.io/js/@quory%2Fstack.svg)](https://badge.fury.io/js/@quory%2Fstack)

This option is for those who need a Quory client to sit on a page within their existing Javascript-based web application, either because:

- You want it to be deployed in a subdirectory of your existing server
- You need the client to be rendered within an existing webpage, without the use of an `<iframe>`
- You want to deploy Quory as a serverless app (we recommend [Quory cloud](TODO) instead for this use case to get managed updates and access to additional features)

### Installation

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

### Setup

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

Now add the Quory frontend client:

#### React

```tsx
import QuoryClientUI from "@quory/stack";

export default function MyApp() {
  return <QuoryClientUI baseURL="/quory" />;
}
```

## Using Quory to build your own data app (@quory/core) [![npm version](https://badge.fury.io/js/@quory%2Fcore.svg)](https://badge.fury.io/js/@quory%2Fcore)

`@quory/core` is the package which powers Quory's auto-joining magic under the hood. It provides a set of functions to obtain information about your database's schema and relationships, as well as a query builder to instantly fetch data from across multiple tables via a single SQL query, without the need to specify how to join the tables.

### Installation

Install the `@quory/core` module, as well as dedicated driver(s) for the database(s) you will be interacting with.

For example:

```
npm install @quory/core @quory/mysql --save
```

Available drivers:

- `@quory/postgres`
- `@quory/mysql`
- `@quory/sqlite`

Need a driver not yet on this list? See [contributing](CONTRIBUTING.md).

### Usage

Follow the guides below.

### Schema introspection

One use case involves simply extracting data about your database schema(s) and their foreign key relationships.

#### `getSchemas`

```ts
import { PostgresDriver } from "@quory/postgres";
import { getSchemas } from "@quory/core";

const driver = new PostgresDriver({
  host: "localhost",
  port: 5432,
  user: "postgres",
  password: "password",
});
const schemasWithRelationships = getSchemas(driver);
```

The returned schema could look like this for a database of books:

```jsonc
{
  "name": "public",
  "tables": [
    {
      "name": "Books",
      "columns": [
        {
          "name": "id",
          "dataType": "BIGINT",
          "genericDataType": "number",
          "isNullable": false,
          "includedInPrimaryKey": true,
          "foreignKeys": [],
          "foreignKeyReferences": [
            {
              "localSchemaName": "public",
              // the books table is referenced by the book_categories table
              "localTableName": "book_categories",
              "localColumnName": "book_id",
              // only foreign key relationships are detected currently
              "hasForeignKeyConstraint": true,
              // so this is always 1
              "confidence": 1.0
            }
          ]
        },
        {
          "name": "author_id",
          "dataType": "BIGINT",
          "genericDataType": "number",
          "isNullable": false,
          "includedInPrimaryKey": false,
          "foreignKeys": [
            {
              "foreignSchemaName": "public",
              "foreignTableName": "authors",
              "foreignColumnName": "id",
              "hasForeignKeyConstraint": true,
              "confidence": 1.0
            }
          ]
        }
      ]
      // ...more tables...
    }
  ]
}
```

#### `getRelationsForTable`

This function will list all the tables that are related to the specified table, including through multiple layers of joins, up to an optionally specified maximum join path length.

```ts
import { getRelationsForTable } from "@quory/core";

// load driver and get schemas...

const relatedTables = getRelationsForTable(
  schemasWithRelationships,
  "public",
  "books"
);
```

In a the database imagined above, this may return something like:

```jsonc
[
  {
    "schemaName": "public",
    "tableName": "authors",
    "shortestJoinPath": 1
  },
  {
    "schemaName": "public",
    "tableName": "book_categories",
    "shortestJoinPath": 1
  },
  {
    "schemaName": "public",
    "tableName": "categories",
    "shortestJoinPath": 2
  }
]
```

#### `getEntitiesAndJunctions`

This function can be used to determine which tables are "entity" tables, used to represent an actual entity in the business logic, and which are "junction" or "linking" tables, used simply for maintaining a many-to-many relationship.

For example:

```ts
import { getEntitiesAndJunctions } from "@quory/core";

// load driver and get schemas...

const { entities, junctions } = getEntitiesAndJunctions(
  schemasWithRelationships
);
```

For our imaginary books database, this could return:

```jsonc
{
  "entities": ["public.authors", "public.books", "public.categories"],
  "junctions": ["public.book_categories"]
}
```

### Fetching data

#### `runQuery`

If you want to find the row(s) in table B that are associated with a given row in table A (possibly through multiple layers of relationship), Quory can do this for you using the `runQuery` function.

This function (by default) uses the [Dijkstra algorithm](https://en.wikipedia.org/wiki/Dijkstra%27s_algorithm) to find the shortest path between the tables and performs a join across those tables to extract the relevant row data.

```ts
import { runQuery } from "@quory/core";

// load driver and get schemas...

const { sql, rowData } = await runQuery(driver, schemasWithRelationships, {
  base: {
    tableRef: "public.books",
    select: [],
    where: {
      id: {
        operator: "=",
        value: "1",
      },
    },
  },
  joins: [
    {
      tableRef: "public.categories",
      select: "*",
    },
  ],
});
```

This might return row data such as:

```jsonc
[
  {
    "categories": {
      "slug": "fiction"
    }
  },
  {
    "categories": {
      "slug": "horror"
    }
  }
]
```

#### Controlling the join path

You can optionally provide hints to Quory about the path it uses to join the tables using the "via" option.

For example, we could modify the example above to find all the categories associated with the same author.

```ts
import { runQuery } from "@quory/core";

// load driver and get schemas...

const { sql, rowData } = await runQuery(driver, schemasWithRelationships, {
  base: {
    tableRef: "public.books",
    select: [],
    where: {
      id: {
        operator: "=",
        value: "1",
      },
    },
  },
  joins: [
    {
      tableRef: "public.categories",
      select: "*",
      via: ["public.authors", "public.books"],
    },
  ],
});
```

If there was another book with the same `author_id` with the category "thriller", you would see the output change to:

```jsonc
[
  {
    "categories": {
      "slug": "fiction"
    }
  },
  {
    "categories": {
      "slug": "horror"
    }
  },
  {
    "categories": {
      "slug": "thriller"
    }
  }
]
```

## Local development

### Prerequisites

We use Turborepo with pnpm. If you do not yet have pnpm installed, install it via NPM: `npm install -g pnpm`

### Setup

1. Clone the repo
2. Run `pnpm install`

#### Building packages
Run `pnpm dev` to run the `build:watch` scripts from all packages in the /packages folder. Note: this script may error when first run, if so just run it a second time.

#### Running Electron client locally
Run `pnpm run serve` to run the `serve` script from the `/packages/client/package.json`, which should launch the Electron app locally.

#### Testing
Each of the packages has a suite of tests, these can be run simultaneously by running `pnpm run test` from the root directory, or run `pnpm run test --filter @quory/<package-name>` to run tests for a single package.

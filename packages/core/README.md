# @quory/core

Quory is the open source database client for support engineers.

This is the low-level Quory core package. For the database client, see [the main README](/README.md).

### Key features
- Introspect your database and quickly extract a graph of its relationships
- Fetch data from many tables in a single query without writing joins manually

## Installation

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

## Usage

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

### Setup

1. Clone the repo
2. Run `npm install`

#### Building packages
Run `npm run dev` to run the `build:watch` scripts from all packages in the /packages folder. Note: this script may error when first run, if so just run it a second time.

#### Running Electron client locally
Run `npx turbo serve` to run the `serve` script from the `/packages/client/package.json`, which should launch the Electron app locally.

#### Testing
Each of the packages has a suite of tests, these can be run simultaneously by running `npm run test` from the root directory, or run `npm run test --workspace @quory/<package-name>` to run tests for a single package.

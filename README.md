# Quory 

> A simple tool for extracting schema and foreign key information from any database!


## Installation [![npm version](https://badge.fury.io/js/@quory%2Fcore.svg)](https://badge.fury.io/js/@quory%2Fcore)

Install the `@quory/core` module, as well as dedicated driver(s) for the database(s) you will be interacting with.

For example:
```
npm install @quory/core @quory/mysql --save
```

## Usage

### `getSchemas`

A basic use case involves simply extracting data about your database schema(s) and their foreign key relationships.

```ts
import { PostgresDriver } from '@quory/postgres';
import { getSchemas } from '@quory/core';

const driver = new PostgresDriver({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'password',
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

### `getRelationsForTable`

This function will list all the tables that are related to the specified table, including through multiple layers of joins, up to an optionally specified maximum join path length.

```ts
import { getRelationsForTable } from '@quory/core';

// load driver and get schemas...

const relatedTables = getRelationsForTable(schemasWithRelationships, 'public', 'books');
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

### `fetchRelatedRows`

If you want to find the row(s) in table B that are associated with a given row in table A (possibly through multiple layers of relationship), Quory can do this for you using the `fetchRelatedRows` function.

This function currently uses the [Dijkstra algorithm](https://en.wikipedia.org/wiki/Dijkstra%27s_algorithm) to find the shortest path between the tables and performs a join across those tables to extract the relevant row data. A future release may allow configuration of the join-path used by this function, to support cases where there are multiple ways to join the tables. If you'd like to see this supported please feel free to raise a PR!

```ts
import { fetchRelatedRows } from '@quory/core';

// load driver and get schemas...

const { sql, rowData } = await fetchRelatedRows(
        driver,
        schemasWithRelationships,
        {
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
      }
    );
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

### `getEntitiesAndJunctions`

This function can be used to determine which tables are "entity" tables, used to represent an actual entity in the business logic, and which are "junction" or "linking" tables, used simply for maintaining a many-to-many relationship.

For example:

```ts
import { getEntitiesAndJunctions } from '@quory/core';

// load driver and get schemas...

const {
    entities,
    junctions
} = getEntitiesAndJunctions(schemasWithRelationships);
```

For our imaginary books database, this could return:

```jsonc
{
    "entities": [
        "public.authors",
        "public.books",
        "public.categories"
    ],
    "junctions": [
        "public.book_categories"
    ]
}
```

# Quory 

> Query across your SQL database instantly without worrying about joins

## Why do I need this?

Quory is a collection of functions for those building data apps that offer users the ability to join tables without writing SQL. It can return information about the database's schema and foreign keys, as well as write queries to fetch data from multiple tables at once without writing explicit joining logic.

## Installation [![npm version](https://badge.fury.io/js/@quory%2Fcore.svg)](https://badge.fury.io/js/@quory%2Fcore)

Install the `@quory/core` module, as well as dedicated driver(s) for the database(s) you will be interacting with.

For example:
```
npm install @quory/core @quory/mysql --save
```

## Usage

### Schema introspection

#### `getSchemas`

One use case involves simply extracting data about your database schema(s) and their foreign key relationships.

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

####  `getRelationsForTable`

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

#### `getEntitiesAndJunctions`

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


### Fetching data

####  `fetchRelatedRows`

If you want to find the row(s) in table B that are associated with a given row in table A (possibly through multiple layers of relationship), Quory can do this for you using the `fetchRelatedRows` function.

This function (by default) uses the [Dijkstra algorithm](https://en.wikipedia.org/wiki/Dijkstra%27s_algorithm) to find the shortest path between the tables and performs a join across those tables to extract the relevant row data.

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
#### Controlling the join path

You can optionally provide hints to Quory about the path it uses to join the tables using the "via" option.

For example, we could modify the example above to find all the categories associated with the same author.

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
                via: ["public.authors", "public.books"]
            },
        ],
    }
);
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

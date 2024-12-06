# Quory

> A simple tool for extracting schema and foreign key information from any database!


## Installation

Install the `@quory/core` module, as well as dedicated driver(s) for the database(s) you will be interacting with.

For example:
```
npm install @quory/core @quory/mysql --save
```

## Usage

### Schema extraction

A basic use case involves simply extracting data about your database schema(s) and their foreign key relationships.

```ts
import QuoryPostgresDriver from '@quory/postgres';
import { getSchemas } from '@quory/core';

const schemasWithRelationships = getSchemas(QuoryPostgresDriver);
```

The returned schema could look like this for a database of books:

```json
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

                            // only foreign key relationships are detected currently so this is always true
                            "hasForeignKeyConstraint": true,
                            // and this is always 1
                            "confidence": 1.0
                        }
                    ]
                }
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

### Graph traversal

A common use case of this type of schema mapping is to find the row(s) in table B that are associated with a given row in table A (possibly through multiple layers of relationship). Quory can do this for you using the `fetchRelatedRows` function:

```ts
import QuoryPostgresDriver from '@quory/postgres';
import { fetchRelatedRows } from '@quory/core';
import { getSchemas } from '@quory/core';

const schemasWithRelationships = getSchemas(QuoryPostgresDriver);
const { sql, rowData } = fetchRelatedRows(
    QuoryPostgresDriver,
    schemasWithRelationships,
    {
        localSchema: "public",
        localTable: "books",
        foreignSchema: "public",
        // find related row(s) in the "categories" table
        foreignTable: "categories",
        localRowData: {
            // find rows related to the book with id=1
            id: "1",
        }
    }
);
```

In a the database imagined above, this may return something like:

```json
    [
        {
            "slug": "fiction",
        },
        {
            "slug": "horror",
        }
    ]
```

### Entities and junctions

The `getEntitiesAndJunctions` function can be used to determine which tables are "entity" tables, used to represent an actual entity in the business logic, and which are "junction" or "linking" tables, used simply for maintaining a many-to-many relationship.

For example:

```ts
import QuoryPostgresDriver from '@quory/postgres';
import { getSchemas } from '@quory/core';

const schemasWithRelationships = getSchemas(QuoryPostgresDriver);

const {
    entities,
    junctions
} = getEntitiesAndJunctions(schemasWithRelationships);
```

For our imaginary books database, this could return:

```json
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

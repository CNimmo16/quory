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

### Constraint-aware joins and migration

Foreign key introspection still returns one `Relationship` record per column pair.
Drivers now provide `constraintId` (unique within the local schema/table) and
`columnPosition` (one-based position in the constraint). `getSchemas` preserves
these fields on both `foreignKeys` and `foreignKeyReferences`. Use the exported
`getTableRelationships(table, schemaName)` to obtain `RelationshipConstraint`
objects with ordered `columnPairs`. For example, a composite foreign key emits:

```ts
[
  {
    constraintId: "parent_fk",
    columnPosition: 1,
    localSchema: "public",
    localTable: "children",
    localColumn: "tenant_id",
    foreignSchema: "public",
    foreignTable: "parents",
    foreignColumn: "tenant_id",
  },
  {
    constraintId: "parent_fk",
    columnPosition: 2,
    localSchema: "public",
    localTable: "children",
    localColumn: "parent_id",
    foreignSchema: "public",
    foreignTable: "parents",
    foreignColumn: "id",
  },
];
```

Custom drivers and stored schema metadata without these fields remain supported
for single-column keys. Each legacy column relationship is treated independently;
composite keys cannot be reconstructed safely from legacy metadata. Refresh
cached schemas and update custom drivers to emit both fields for every composite
pair. Missing, duplicate, or non-contiguous positions on identified constraints
are rejected when those relationships are resolved.

### Selecting a relationship with `via`

`JoinDef.via` accepts strings and objects. A string such as `"public.users"` is
expanded to `{ tableRef: "public.users" }` before planning; the two forms behave
identically. Existing intermediate-table routes continue to work. The destination
is appended automatically when omitted, and may now be supplied as the final
step to specify its incoming relationship:

```ts
{
  tableRef: "public.users",
  select: ["name"],
  via: [{ tableRef: "public.users", fromColumnName: "sender_id" }],
}
```

Each object may supply `fromColumnName`, `toColumnName`, or both. These column
names are directional: `fromColumnName` belongs to the preceding table and
`toColumnName` belongs to this step's table, even when traversing a foreign key
in reverse. Either field alone is enough if it uniquely identifies a constraint.
When both are supplied, they must match the same column pair in that constraint.

Alternatively, specify `usingConstraintId` to identify the constraint:

```ts
via: [{ tableRef: "public.parents", usingConstraintId: "children_parent_fk" }];
```

Do not combine `usingConstraintId` with either column selector. All column pairs
of the selected constraint are joined, even if only one column identified it.
Constraint IDs are scoped to their owning tables; if the same ID matches keys in
both directions, use directional column selectors instead.

Unselected waypoints retain automatic shortest-path expansion. A step with a
selector must be adjacent to the preceding waypoint; explicitly include any
intermediate tables before it. Duplicate waypoints and routes that name the
destination before the final step are rejected. The base table cannot have a
`via` route. Prepared queries expand routes into nested joins and retain each
edge's selectors so they can be executed again.

If more than one constraint still matches, preparation, execution, and counting
reject the query with available constraints and their directional column pairs,
and explain how to narrow the selection. Invalid selectors never fall back to
an arbitrary relationship. The assistant and web query validators accept this
format; a visual constraint picker has not been added.

Generated SQL result aliases are unique, short identifiers per selected column
(for example, `quory__result__1`). Each prepared join exposes a `resultAliases`
mapping from column name to SQL alias. Code constructing `PreparedJoinDef`
objects must supply this new field (use `prepareQuery` to populate it). Consumers
executing prepared SQL directly must use this mapping instead of hardcoded aliases; `runQuery` uses the same
mapping to decode rows. The `rows[].data` column names returned by `runQuery`
remain unchanged. Join aliases are generated identifiers and should be treated
as opaque; ambiguous intermediate join instances are rejected rather than
reusing an arbitrary branch.

### Parameterized execution

`prepareQuery(schemas, query, dialect)` now returns `{ sql, parameters, preparedQuery, joinsList }`.
The dialect is `"postgres"`, `"mysql"`, or `"sqlite"` (the default). SQL contains
quoted identifiers and placeholders, so callers executing compiled SQL directly
must pass the returned `parameters` to a driver using the same dialect. Do not
interpolate the values into the SQL string. `runQuery` and `getCountForQuery`
select the driver's dialect and pass bindings automatically.

Custom drivers must expose `readonly dialect: SqlDialect` and implement
`exec(sql: string, parameters?: SqlParameter[]): Promise<Row[]>` using their
database client's parameter-binding API. Shared schema validation applies to
all entry paths, including the expanded `via` format above.

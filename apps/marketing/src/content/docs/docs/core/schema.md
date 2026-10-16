---
title: "Discover your schema"
description: "Inspect tables and foreign keys before building relationship queries."
sidebar:
  order: 2
---

Schema discovery gives Quory the information it needs to plan joins. Start with the driver from the [core quickstart](/docs/core/getting-started/).

## List tables and columns

```ts
import { getSchemas } from "@quory/core";

const schemas = await getSchemas(driver);

for (const schema of schemas) {
  for (const table of schema.tables) {
    console.log(`${schema.name}.${table.name}`);
    for (const column of table.columns) {
      console.log(column.name, column.genericDataType);
    }
  }
}
```

Each column includes its database type, generic type, nullability, primary-key membership, outgoing `foreignKeys`, and incoming `foreignKeyReferences`. Both directions matter: starting from a customer, you can discover the orders that reference it.

## Find reachable tables

```ts
import { getRelationsForTable } from "@quory/core";

const related = getRelationsForTable(schemas, "public", "customers", 3);

for (const table of related) {
  console.log(table.schemaName, table.name, table.shortestJoinPath);
}
```

The optional final argument limits the number of joins in a path. This is useful for a table picker that starts with nearby relationships rather than showing every reachable table.

## Separate entities and junction tables

```ts
import { getEntitiesAndJunctions } from "@quory/core";

const { entities, junctions } = getEntitiesAndJunctions(schemas);
console.log({ entities, junctions });
```

These are table-reference lists inferred from schema structure. Use them to organise an interface; review the classification before treating it as a business-domain model. A linking table can still contain information your users need.

## Refresh after schema changes

A discovered schema is a snapshot. After migrations that add tables, columns, or constraints, call `getSchemas` again before preparing new queries. Persisted schema metadata also needs refreshing when upgrading to constraint-aware joins, especially for composite foreign keys.

If a relationship is missing, check that the database declares the foreign key and that the connected account can inspect the relevant tables. Quory does not discover relationships by comparing values or column names.

---
title: "Filter, sort, and paginate"
description: "Build a useful relationship query and handle joined results and counts."
sidebar:
  order: 3
---

Use the driver and schemas from the [core quickstart](/docs/core/getting-started/). These examples assume customers with `id` and `email` columns and orders with `id`, `customer_id`, and `created_at` columns.

## Build a query

```ts
import { ConditionOperator, runQuery, type Query } from "@quory/core";

const query: Query = {
  base: {
    tableRef: "public.customers",
    select: ["id", "email"],
    where: {
      operator: ConditionOperator.AND,
      conditions: [
        {
          column: "email",
          operator: ConditionOperator.LIKE,
          value: "%@example.com",
        },
        {
          column: "id",
          operator: ConditionOperator.IN,
          values: ["1", "2", "3"],
        },
      ],
    },
    joins: [
      {
        tableRef: "public.orders",
        select: ["id", "created_at"],
        orderBy: [{ column: "created_at", direction: "desc" }],
      },
    ],
  },
  limit: 25,
  offset: 0,
};

const result = await runQuery(driver, schemas, query);
```

Filters belong to the table whose columns they reference. A value condition uses `column`, `operator`, and a string `value`; a list condition uses `values`. Combine conditions with `AND` or `OR`. Use the exported `ConditionOperator` enum in TypeScript.

Select specific column names, `"*"` for all columns, or `[]` to traverse a table without selecting its columns. Joins can have their own filters, ordering, and nested joins.

## Move through results

```ts
const nextPage = await runQuery(driver, schemas, {
  ...query,
  offset: (query.offset ?? 0) + (query.limit ?? 100),
});
```

`runQuery` defaults to a limit of 100 and an offset of 0. It appends primary-key ordering to stabilise page boundaries when sort values tie. Tables without usable primary keys cannot offer the same record identity guarantees, and rows can still move between pages if the database changes.

Reset the offset when changing filters or relationships. A joined result row is the pagination unit, so a page can contain repeated base records.

## Fetch a count separately

```ts
import { getCountForQuery } from "@quory/core";

const { count } = await getCountForQuery(driver, schemas, query);
```

The count describes all matching joined rows, ignoring the page's limit and offset. It is not a distinct count of the base table. Fetch it when the interface needs it; a large relationship query may make counting expensive.

## Inspect generated SQL

```ts
import { prepareQuery } from "@quory/core";

const { sql, parameters } = await prepareQuery(schemas, query, driver.dialect);
console.log(sql, parameters);
```

Compilation uses quoted identifiers and parameter placeholders. If you execute compiled SQL directly, pass `parameters` separately to a driver of the same dialect. Never interpolate them into the SQL string.

`prepareQuery` does not add the pagination applied by `runQuery`. Prefer `runQuery` for paged execution and decoded records. Treat generated join and result aliases as opaque; prepared joins include `resultAliases` for consumers that need to decode raw SQL output.

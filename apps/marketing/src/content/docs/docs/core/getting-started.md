---
title: "Your first core query"
description: "Install the core library and a driver, discover a schema, and run a relationship query."
sidebar:
  order: 1
---

Use `@quory/core` when you want the relationship engine in your own Node.js code. It does not require React or the desktop app.

## Install core and a driver

```sh
npm install @quory/core @quory/postgres
```

For MySQL or SQLite, replace the driver package with `@quory/mysql` or `@quory/sqlite`. See [database connections](/docs/drivers/databases/) for their constructors and schema naming.

Keep database credentials and driver code on the server.

## Connect and discover the schema

This example assumes a PostgreSQL database with `public.customers(id, email)` and `public.orders(id, customer_id)`, with a foreign key from `orders.customer_id` to `customers.id`. Substitute tables and columns from your own database.

```ts
import { ConditionOperator, getSchemas, runQuery } from "@quory/core";
import { PostgresDriver } from "@quory/postgres";

const driver = new PostgresDriver({
  host: process.env.PGHOST ?? "localhost",
  port: Number(process.env.PGPORT ?? 5432),
  database: process.env.PGDATABASE,
  username: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

try {
  await driver.testConnection();
  const schemas = await getSchemas(driver);

  const result = await runQuery(driver, schemas, {
    base: {
      tableRef: "public.customers",
      select: ["id", "email"],
      where: {
        column: "email",
        operator: ConditionOperator.EQUALS,
        value: "alex@example.com",
      },
      joins: [{ tableRef: "public.orders", select: ["id"] }],
    },
    limit: 25,
    offset: 0,
  });

  for (const row of result.rows) {
    for (const record of row) {
      console.log(record.tableRef, record.data);
    }
  }
} finally {
  await driver.teardown();
}
```

`getSchemas` is asynchronous. Await it before planning or running a query. The `joins` array belongs inside `base` (and can be nested inside another join).

## Read the result

`runQuery` returns `sql`, `meta`, and `rows`. Each result row contains an array of records, one for each prepared join. Each record identifies its table and join alias and puts the selected column values in `data`.

A customer with several orders can appear in several rows. An inner join excludes a customer with no orders. Use `tableRef` and `joinAlias` to distinguish records rather than relying on a hardcoded array position or generated SQL alias.

The one-shot example closes the driver in `finally`. In a service, keep the driver for the service lifetime and call `teardown()` during shutdown.

Next, learn to [inspect your schema](/docs/core/schema/) or [filter and paginate queries](/docs/core/querying/).

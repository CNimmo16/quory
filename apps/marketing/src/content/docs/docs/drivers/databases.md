---
title: "Database connections"
description: "Configure PostgreSQL, MySQL, and SQLite drivers and TLS for Quory."
sidebar:
  order: 1
---

The desktop client includes all three drivers. Core users install a driver explicitly; stack selects one from the server's database configuration.

| Database   | Package           | Core constructor | Typical table reference |
| ---------- | ----------------- | ---------------- | ----------------------- |
| PostgreSQL | `@quory/postgres` | `PostgresDriver` | `public.customers`      |
| MySQL      | `@quory/mysql`    | `MySQLDriver`    | `shop.customers`        |
| SQLite     | `@quory/sqlite`   | `SqliteDriver`   | `main.customers`        |

Use actual schema names from `getSchemas`. Each driver implements the interface consumed by core, so the query workflow stays the same after connection setup.

## PostgreSQL

```sh
npm install @quory/core @quory/postgres
```

```ts
import { PostgresDriver } from "@quory/postgres";

const driver = new PostgresDriver({
  host: process.env.PGHOST ?? "localhost",
  port: Number(process.env.PGPORT ?? 5432),
  database: process.env.PGDATABASE,
  username: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});
```

The driver wraps `postgres`. Use its connection options for direct core usage, including the TLS configuration required by your database host.

## MySQL

```sh
npm install @quory/core @quory/mysql
```

```ts
import { MySQLDriver } from "@quory/mysql";

const driver = new MySQLDriver({
  host: process.env.MYSQL_HOST ?? "localhost",
  port: Number(process.env.MYSQL_PORT ?? 3306),
  database: process.env.MYSQL_DATABASE,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
});
```

The driver wraps `mysql2/promise`. Notice that its direct constructor uses `user`; stack's normalised configuration uses `username`.

## SQLite

```sh
npm install @quory/core @quory/sqlite
```

```ts
import { SqliteDriver } from "@quory/sqlite";

const driver = new SqliteDriver("/absolute/path/to/shop.sqlite", {
  readonly: true,
  fileMustExist: true,
});
```

The driver wraps `better-sqlite3`. The file is local to the process running Quory, not the browser visiting a stack app. Native bindings must match the Node.js or Electron runtime and architecture.

For stack, use this database configuration:

```ts
const database = {
  type: "sqlite" as const,
  hostOrFilePath: "/absolute/path/to/shop.sqlite",
};
```

The stack configuration does not expose the core driver's `readonly` option. Use an appropriate deployment and access policy rather than assuming this snippet opens a read-only database.

## TLS in the client and stack

For remote PostgreSQL and MySQL connections, prefer **verify-full** with the certificate authority required by your database provider. **require** encrypts the connection but disables certificate verification.

Stack accepts PEM contents, not certificate file paths:

```ts
const ssl = {
  mode: "verify-full" as const,
  ca: process.env.DATABASE_CA_PEM,
  // cert and key can contain PEM values for mutual TLS when required.
};
```

Set this as `database.ssl` in the handler configuration. Omitting `ssl` disables TLS in stack. Use this option only for PostgreSQL and MySQL; SQLite is a local-file database.

## Close the connection

When using a driver directly, call `await driver.teardown()` when its owner finishes. Stack manages its driver internally; call `await handler.dispose()` instead.

If you can connect but cannot join tables, inspect the schema and declared foreign keys. Connection success alone does not guarantee a relationship path exists.

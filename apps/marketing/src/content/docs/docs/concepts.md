---
title: "How Quory works"
description: "Understand schemas, relationship paths, query results, and the boundaries of automatic joins."
sidebar:
  order: 2
---

Quory starts with your database schema: the tables, columns, primary keys, and foreign key constraints. It uses those constraints to build a graph of related tables.

## Start with one table

A relationship query has a **base table**. For a customer investigation, this might be `public.customers`, filtered to the customer's ID or email. Choose which columns to show, then add related tables such as orders or products.

A table reference includes its schema: `public.customers` in a typical PostgreSQL database, `shop.customers` in MySQL, or `main.customers` in SQLite. Use the names returned by schema discovery rather than assuming every database uses `public`.

## Follow relationships

Imagine these foreign keys:

```text
orders.customer_id → customers.id
order_items.order_id → orders.id
order_items.product_id → products.id
```

Starting from a customer, Quory can reach products through orders and order items. You ask for the destination table; Quory finds a shortest relationship path and inserts the intermediate joins. It can follow foreign keys in either direction.

The engine does not infer relationships from similar column names. If no foreign-key path exists, there is no automatic join to make.

## Choose the meaning of a join

The shortest path is not always the path you intend. An order might have both a billing address and a shipping address. Use an explicit path or relationship selector when that distinction matters. If multiple foreign keys could satisfy the same edge, Quory reports the ambiguity instead of picking one arbitrarily.

See [choosing relationship paths](/docs/core/relationships/) for a practical guide to `via` and composite keys.

## Understand the results

Relationship queries use **inner joins**. Adding orders to a customer query excludes customers with no matching orders. A customer with three matching orders can appear in three joined rows. Pagination and counts apply to joined result rows, not distinct customers.

Selecting no columns from an intermediate table hides its fields from the output; it does not remove the relationship or its effect on the result. Keep the first query small, inspect its results, and add relationships deliberately.

## Keep the layers separate

- **Core** discovers schemas, plans joins, and executes parameterised SQL through a database driver.
- **Stack** connects that engine to a request handler and React hooks.
- **Client** provides the desktop workspace, projects, saved queries, SQL editor, and optional assistant.

The relationship builder produces read queries. The desktop SQL workspace also supports statements that change data, subject to the connection's write protection. A database account with appropriate permissions remains the access boundary for any flavour.

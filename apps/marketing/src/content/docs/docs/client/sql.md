---
title: "Work with SQL"
description: "Use the desktop SQL workspace and understand connection write protection."
sidebar:
  order: 4
---

Use a relationship query when you want Quory to plan joins. Use the SQL workspace when you need to write a statement directly.

## Run a statement

Create a SQL query in the selected project and connection. Enter SQL for that database's dialect, then run it and inspect the returned columns and rows. Keep the result small while developing the statement.

The **Bound parameters** field accepts a JSON array in placeholder order. For example, on PostgreSQL:

```sql
SELECT id, email FROM public.customers WHERE email = $1
```

```json
["alex@example.com"]
```

MySQL and SQLite use `?` placeholders instead. Pass values as parameters rather than inserting them into SQL text.

## Choose write protection deliberately

Connections default to **Read only**. Their write-protection setting controls the SQL workspace:

| Mode                 | Behaviour                                             |
| -------------------- | ----------------------------------------------------- |
| Read only            | SQL cannot change data on this connection.            |
| Confirm before write | Statements that may change data require confirmation. |
| Dangerously write    | SQL can change or delete data without confirmation.   |

Use a read-only database account for investigation work as well. Application settings do not grant database permissions; a write still requires permission from the database.

## Know the result limits

Custom SQL execution has a 15-second timeout and returns at most 1,000 result rows. A truncated result is not the full dataset; add filters or a deliberate `LIMIT` when investigating large tables. Cancelling a statement and seeing an error does not mean you should assume the database is unchanged—check the outcome before retrying a write.

The [query assistant](/docs/client/assistant/) builds relationship queries. It does not generate arbitrary SQL or perform database writes.

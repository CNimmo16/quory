---
title: "Build a React interface"
description: "Use the Quory provider and hooks to fetch schemas, query results, and counts."
sidebar:
  order: 2
---

Start with the POST endpoint from [Connect your backend](/docs/stack/getting-started/). These examples assume it is available at `/quory` on the same origin as your React app.

## Add the provider

```tsx
import { QuoryProvider } from "@quory/stack/react";
import { CustomerOrders } from "./CustomerOrders";

export function App() {
  return (
    <QuoryProvider endpointUrl="/quory">
      <CustomerOrders />
    </QuoryProvider>
  );
}
```

The provider owns its query cache and sends requests to your endpoint. Mount it around the part of your app that uses Quory hooks.

## Fetch and render a query

Stack's query input uses the shared core query shape. If importing core types directly, declare `@quory/core` as a dependency of your app:

```sh
npm install @quory/core
```

This example assumes `public.customers(id, email)` and `public.orders(id, customer_id)` connected by a foreign key:

```tsx
import { useState } from "react";
import type { Query } from "@quory/core";
import { useQuery, useQueryCount } from "@quory/stack/react";

export function CustomerOrders() {
  const [query, setQuery] = useState<Query>({
    base: {
      tableRef: "public.customers",
      select: ["id", "email"],
      joins: [{ tableRef: "public.orders", select: ["id"] }],
    },
    limit: 25,
    offset: 0,
  });

  const { data, error, isLoading } = useQuery(query, setQuery);
  const { count } = useQueryCount(query);

  if (error) return <p role="alert">The query could not be loaded.</p>;
  if (!data) return <p>Loading records…</p>;

  return (
    <section aria-busy={isLoading}>
      <p>{count === null ? "Counting…" : `${count} matching rows`}</p>
      {data.rows.length === 0 ? (
        <p>No matching records.</p>
      ) : (
        <table>
          <caption>Customers and their orders</caption>
          <thead>
            <tr>
              {data.visibleJoins.flatMap(({ join, columns }) =>
                columns.map((column) => (
                  <th key={`${join.joinAlias}.${column.name}`} scope="col">
                    {join.tableRef}: {column.readableName}
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.flat().map((cell) => (
                  <td key={`${cell.joinAlias}.${cell.rawField}`}>
                    {cell.readableValue}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button
        disabled={isLoading || (query.offset ?? 0) === 0}
        onClick={() =>
          setQuery({ ...query, offset: Math.max(0, (query.offset ?? 0) - 25) })
        }
      >
        Previous
      </button>
      <button
        disabled={isLoading || data.rows.length < 25}
        onClick={() => setQuery({ ...query, offset: (query.offset ?? 0) + 25 })}
      >
        Next
      </button>
    </section>
  );
}
```

`useQuery` returns display-ready cells grouped by row and join, plus `visibleJoins` for column metadata. This differs from core's raw `record.data` objects. `useQueryCount` returns `count`, not `data`; it accepts the whole query, including `base`.

The count is a separate request. Handle its `error` and `isLoading` states if a total is required by your UI, or omit the hook when you only need a page of results. You can pass `null` to either query hook to defer fetching until the user chooses a query.

## Discover tables for a picker

```tsx
import { useFetchSchema } from "@quory/stack/react";

export function TableList() {
  const { data, error, isLoading } = useFetchSchema();
  if (error) return <p role="alert">Could not load tables.</p>;
  if (isLoading || !data) return <p>Loading tables…</p>;
  return (
    <ul>
      {data.tables.map((table) => (
        <li key={`${table.schemaName}.${table.name}`}>
          {table.schemaName}.{table.name}
        </li>
      ))}
    </ul>
  );
}
```

Schema data also includes `schemas`, `entityTableRefs`, and `junctionTableRefs`. Use these to build your own navigation. Stack does not export the desktop workspace as a component.

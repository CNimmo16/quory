---
title: "Authentication and deployment"
description: "Integrate stack with your application transport, session lifecycle, and hosting environment."
sidebar:
  order: 3
---

A stack integration runs with the database credentials you configure on its server. Treat access to its endpoint as access to the schema and data those credentials can read.

## Apply your application's access controls

Authenticate and authorise every request before calling the handler. Do not accept database credentials or choose a privileged database session from an untrusted browser request.

The current stack is not a row- or column-level authorisation layer. UI-hidden columns and client-provided query filters are not access controls. Use appropriately scoped database permissions, restricted views, or application-enforced policies for the information each caller may access.

Use separate handler lifetimes for separate database sessions, and call `dispose()` when a session ends. Remount the frontend provider when changing user or database scope so cached results do not remain visible under the previous scope.

## Choose a transport

For a same-origin app, `endpointUrl="/quory"` uses a JSON POST request and the browser's normal same-origin credential behaviour. Apply the CSRF protection used elsewhere in your application.

Use `fetchFn` when you need a custom transport, cross-origin cookies, or application-specific headers:

```tsx
import { QuoryProvider } from "@quory/stack/react";

async function fetchQuory(path: string, data?: unknown, signal?: AbortSignal) {
  const response = await fetch("https://internal.example.com/quory", {
    method: "POST",
    credentials: "include",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, data }),
  });
  if (!response.ok) throw new Error("Quory request failed");
  return response.json();
}

export function QuoryArea({ children }: { children: React.ReactNode }) {
  return <QuoryProvider fetchFn={fetchQuory}>{children}</QuoryProvider>;
}
```

Replace the example origin and configure the server's cookie and CORS policy for your app. Keep database credentials on the backend.

The default `endpointUrl` transport also sends execution IDs and cancellation requests for queries. A custom `fetchFn` must implement that protocol itself if it needs server-side cancellation; aborting an HTTP fetch alone does not guarantee database work stops.

## Choose a compatible host

Run the handler in a Node.js environment that can reach your database. PostgreSQL and MySQL need network access to the database host. SQLite needs a file accessible to the server and a compatible native `better-sqlite3` build; stack uses a worker-backed SQLite driver.

A browser-only static host cannot run the backend. Do not assume an edge or serverless platform supports the database transport, native dependencies, workers, persistent files, or connection lifetime your setup requires. Validate those requirements before deploying.

## Refresh and close cleanly

The handler caches the discovered schema. Call `refreshSchema()` after migrations, or `invalidateSchema()` to refresh before a later operation. Close session handlers with `dispose()` when their owner ends the session or shuts down.

For a shared service, avoid creating a handler for every request. For a multi-user app, avoid sharing one handler across callers who require different database access.

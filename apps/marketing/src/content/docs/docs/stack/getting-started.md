---
title: "Connect your backend"
description: "Add a Quory request handler to an existing Node.js application."
sidebar:
  order: 1
---

Use `@quory/stack` to connect Quory's query engine to an existing React application. Stack supplies a server handler and frontend hooks; you supply the UI, HTTP endpoint, authentication, and authorisation.

## Install the packages

```sh
npm install @quory/stack @quory/postgres
```

This guide uses PostgreSQL. MySQL and SQLite are also supported. Keep the server entry point out of browser bundles: import the handler from **`@quory/stack/server`** and frontend code from **`@quory/stack/react`**.

## Initialise a handler

Create the handler on the server and await it before accepting requests:

```ts
import { makeQuoryRequestHandler } from "@quory/stack/server";

const handleQuoryRequest = await makeQuoryRequestHandler({
  database: {
    type: "postgres",
    hostOrFilePath: process.env.PGHOST ?? "localhost",
    port: Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE!,
    username: process.env.PGUSER!,
    password: process.env.PGPASSWORD!,
  },
});
```

Set the environment variables before starting the server. For PostgreSQL and MySQL, stack requires a port, database, username, and non-empty password. Handler creation checks the connection and loads the schema, so it can fail before the first HTTP request.

For TLS or another database, see [database connections](/docs/drivers/databases/).

## Mount an authenticated POST route

In an existing Express application, add a route like this. `requireSupportAccess` represents your application's middleware that authenticates the user and checks permission to access this database; implement it before exposing the endpoint.

```ts
app.use(express.json({ limit: "256kb" }));

app.post("/quory", requireSupportAccess, async (req, res) => {
  try {
    const result = await handleQuoryRequest(req.body);
    res.json(result);
  } catch (error) {
    // Send details to your server's logger, not to the browser.
    console.error("Quory request failed", error);
    res.status(400).json({ error: "Unable to complete the Quory request." });
  }
});
```

The handler takes a parsed JSON body containing `path` and `data`; the React provider constructs it for you. Do not wrap the result in an extra property, because the hooks expect the handler's response directly.

One shared handler is suitable only when all authorised callers are intended to access that same database session. For different credentials or access scopes, create and manage separate handlers on the server.

## Own the handler's lifetime

Keep the handler for the lifetime of its database session rather than reconnecting for every request. When the session ends or the server shuts down, stop accepting requests and call:

```ts
await handleQuoryRequest.dispose();
```

After a database migration, refresh the handler's schema:

```ts
await handleQuoryRequest.refreshSchema();
```

Next, [connect the React frontend](/docs/stack/react/).

# @quory/stack

A library for integrating [Quory](https://github.com/CNimmo16/quory) into your existing web app.

[Read the docs here](https://github.com/CNimmo16/quory)

## Browser-owned databases

`@quory/stack/browser` exposes `makeBrowserQuoryHandler(driver)` for a browser-safe
implementation of the core `DatabaseDriver` interface. It introspects the driver
and uses the same validated schema, query and count routes as the server adapter,
without importing native SQLite, PostgreSQL or MySQL drivers.

```tsx
const session = await makeBrowserQuoryHandler(driver);
<QuoryProvider fetchFn={session.fetchFn}>{children}</QuoryProvider>;
// When the session ends:
await session.dispose();
```

For synchronous WASM SQLite, run the handler inside a Web Worker and bridge
`fetchFn` over messages to keep the UI responsive. The marketing demo provides
an example, including worker termination for timed-out sessions.

`DataTable`, `TableNavigator`, `TableColumnsMenu`, `TooltipProvider`, and the supporting UI exports
are shared with the desktop client. Supply the `rows`, `visibleJoins`, and
`joinActions` returned by `useQuery` to get cell inspection, filtering, sorting,
relationship navigation and displayed-column selection. These components use the
shared Quory theme tokens and Tailwind utilities; include the package's sources
in the consuming application's Tailwind scan. The Electron client retains
compatibility exports at its original component paths.

Place `TableNavigator` above `DataTable`, supplying `useQuery().query` (the
prepared query), schemas and the same `joinActions`. Share
`highlightedJoinAlias`/`onChangeHighlightedJoinAlias` between both components to
highlight the diagram and results together. The navigator includes editable
filters, column controls, adding/removing related tables, responsive diagram
layout, and mouse/keyboard pan and zoom.

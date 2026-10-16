---
title: "Choose relationship paths"
description: "Guide automatic joins and resolve ambiguous or composite foreign keys."
sidebar:
  order: 4
---

Quory normally finds a shortest path from the current table to a requested related table. Use `via` when the intended relationship needs more detail.

## Guide a path through intermediate tables

Suppose a customer has orders, order items, and products connected by foreign keys. You can make the intended route explicit:

```ts
import type { Query } from "@quory/core";

const query: Query = {
  base: {
    tableRef: "public.customers",
    select: ["id"],
    joins: [
      {
        tableRef: "public.products",
        select: ["id", "name"],
        via: ["public.orders", "public.order_items"],
      },
    ],
  },
};
```

String waypoints still allow automatic shortest-path expansion between them. The destination is appended when omitted. Do not repeat waypoints or name the destination before the final step, and do not put `via` on the base table.

## Pick one of several foreign keys

Suppose `public.messages` has both `sender_id` and `recipient_id` referencing `public.users.id`. To join the sender, use this join under the messages base:

```ts
const senderJoin = {
  tableRef: "public.users",
  select: ["id", "name"],
  via: [{ tableRef: "public.users", fromColumnName: "sender_id" }],
};
```

`fromColumnName` belongs to the preceding table; `toColumnName` belongs to the step's table. The meaning stays directional when following a foreign key in reverse. Either selector is sufficient if it uniquely identifies the relationship; when both are supplied, they must describe the same column pair.

Alternatively, select a known constraint:

```ts
const senderJoin = {
  tableRef: "public.users",
  select: ["id", "name"],
  via: [{ tableRef: "public.users", usingConstraintId: "messages_sender_fk" }],
};
```

Use the actual constraint ID from the discovered schema. Do not combine `usingConstraintId` with column selectors. IDs are scoped to their owning tables; if an ID matches relationships in both directions, use directional column selectors.

A selected step must be adjacent to the previous waypoint. Include intermediate tables explicitly before selecting the final relationship.

## Work with composite keys

A composite foreign key represents one relationship with several column pairs. Choosing it joins all those pairs, even when a single column selector identifies the constraint.

```ts
import { getTableRelationships } from "@quory/core";

const schema = schemas.find((item) => item.name === "public")!;
const table = schema.tables.find((item) => item.name === "messages")!;
const relationships = getTableRelationships(table, schema.name);
console.log(relationships);
```

Built-in drivers include `constraintId` and one-based `columnPosition` metadata. If you use cached schemas or a custom driver, retain both for every composite pair. Legacy single-column relationships remain supported, but legacy metadata cannot safely reconstruct composite keys.

An ambiguous or invalid selection fails during preparation, execution, or counting. Use the reported constraints and directional column pairs to narrow the query rather than falling back to an arbitrary relationship.

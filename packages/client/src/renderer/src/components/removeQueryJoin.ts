import type { PreparedJoinDef, PreparedQuery } from "@quory/core";

// Descendants still need the removed table as a relationship waypoint. Preserve
// the exact edge selectors, especially when several foreign keys share a table.
export function removeQueryJoin(
  query: PreparedQuery,
  alias: string
): PreparedQuery {
  if (query.base.joinAlias === alias)
    throw new Error("Cannot remove base join");
  function visit(join: PreparedJoinDef): PreparedJoinDef[] {
    if (join.joinAlias === alias) {
      return join.joins.map((child) => ({
        ...child,
        via: [
          ...(join.via?.length ? join.via : [{ tableRef: join.tableRef }]),
          ...(child.via?.length ? child.via : [{ tableRef: child.tableRef }]),
        ],
      }));
    }
    return [{ ...join, joins: join.joins.flatMap(visit) }];
  }
  return { ...query, offset: 0, base: visit(query.base)[0]! };
}

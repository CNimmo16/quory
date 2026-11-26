import type { PreparedJoinDef, PreparedQuery } from "@quory/core";

// Descendants still need the removed table as a relationship waypoint. Preserve
// the exact edge selectors, especially when several foreign keys share a table.
export function removeQueryJoin(
  query: PreparedQuery,
  alias: string,
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
    const joins = join.joins.flatMap(visit);
    // Only prune bridges emptied by this removal, not unrelated empty tables
    // or tables still contributing filters, sorting, or another branch.
    if (
      join !== query.base &&
      join.joins.length > 0 &&
      joins.length === 0 &&
      join.select.length === 0 &&
      !join.where &&
      !join.orderBy?.length
    ) {
      return [];
    }
    return [{ ...join, joins }];
  }
  return { ...query, offset: 0, base: visit(query.base)[0]! };
}

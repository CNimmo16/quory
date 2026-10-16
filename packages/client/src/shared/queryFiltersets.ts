import type { Condition, JoinDef, Query } from "@quory/core";

export type FiltersetSnapshot = {
  relationshipTree: string;
  filters: { path: number[]; where: Condition }[];
};
export type SavedFilterset = {
  projectId: string;
  queryId: string;
  name: string;
  createdAt: string;
  snapshot: FiltersetSnapshot;
};

function relationshipTree(join: JoinDef): unknown {
  return {
    tableRef: join.tableRef,
    via: (join.via ?? []).map((step) =>
      typeof step === "string"
        ? { tableRef: step }
        : {
            tableRef: step.tableRef,
            fromColumnName:
              "fromColumnName" in step ? step.fromColumnName : undefined,
            toColumnName:
              "toColumnName" in step ? step.toColumnName : undefined,
            usingConstraintId:
              "usingConstraintId" in step ? step.usingConstraintId : undefined,
          },
    ),
    joins: (join.joins ?? []).map(relationshipTree),
  };
}

export function captureFilterset(query: Query): FiltersetSnapshot {
  const filters: FiltersetSnapshot["filters"] = [];
  function visit(join: JoinDef, path: number[]) {
    if (join.where) filters.push({ path, where: structuredClone(join.where) });
    join.joins?.forEach((child, index) => visit(child, [...path, index]));
  }
  visit(query.base, []);
  return {
    relationshipTree: JSON.stringify(relationshipTree(query.base)),
    filters,
  };
}

export function applyFilterset(
  query: Query,
  snapshot: FiltersetSnapshot,
): Query {
  if (
    JSON.stringify(relationshipTree(query.base)) !== snapshot.relationshipTree
  )
    throw new Error(
      "This filterset uses different tables or relationships. Restore that relationship tree before applying it.",
    );
  const next = structuredClone(query);
  function clear(join: JoinDef) {
    delete join.where;
    join.joins?.forEach(clear);
  }
  clear(next.base);
  for (const filter of snapshot.filters) {
    let join = next.base;
    for (const index of filter.path) {
      const child = join.joins?.[index];
      if (!child) throw new Error("A table used by this filterset is missing.");
      join = child;
    }
    join.where = structuredClone(filter.where);
  }
  return { ...next, offset: 0 };
}

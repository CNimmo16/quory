import {
  findTableFromSchemas,
  normalizeVia,
  splitTableRef,
  type DatabaseSchema,
  type PreparedJoinDef,
  type PreparedQuery,
  type ViaTableStep,
} from "@quory/core";

/** Promote a remaining table, keeping exact relationships between surviving branches. */
export default function removeBaseJoin(
  query: PreparedQuery,
  schemas: DatabaseSchema[],
): PreparedQuery {
  if (!query.base.joins.length) {
    throw new Error("Cannot remove the only table in a query.");
  }
  function selectedPath(join: PreparedJoinDef): PreparedJoinDef[] | undefined {
    if (join.select.length) return [join];
    for (const child of join.joins) {
      const path = selectedPath(child);
      if (path) return [join, ...path];
    }
    return undefined;
  }
  const path = query.base.joins.map(selectedPath).find(Boolean) ?? [
    query.base.joins[0]!,
  ];
  let base: PreparedJoinDef = {
    ...query.base,
    select: [],
    resultAliases: {},
    where: undefined,
    orderBy: undefined,
  };
  for (const child of path) {
    const siblings = base.joins.filter(
      (join) => join.joinAlias !== child.joinAlias,
    );
    const keepBridge =
      siblings.length > 0 ||
      base.select.length > 0 ||
      base.where ||
      base.orderBy?.length;
    const step = normalizeVia(child.via)[0];
    const reverse: ViaTableStep =
      step?.usingConstraintId !== undefined
        ? { tableRef: base.tableRef, usingConstraintId: step.usingConstraintId }
        : {
            tableRef: base.tableRef,
            fromColumnName: step?.toColumnName,
            toColumnName: step?.fromColumnName,
          };
    base = {
      ...child,
      via: [],
      joins: [
        ...child.joins,
        ...(keepBridge ? [{ ...base, via: [reverse], joins: siblings }] : []),
      ],
    };
  }
  // A remaining table may have been used only for filtering or as a bridge.
  if (!base.select.length) {
    const [schemaName, tableName] = splitTableRef(base.tableRef);
    base.select = findTableFromSchemas(
      schemas,
      schemaName,
      tableName,
    ).columns.map(({ name }) => name);
  }
  return { ...query, base, offset: 0 };
}

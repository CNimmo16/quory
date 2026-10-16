import type { DatabaseTableInfo, RelationshipConstraint } from "..";

/** Reconstruct constraints from column metadata, preserving ordered pairs. */
export default function getTableRelationships(
  table: DatabaseTableInfo,
  schemaName: string,
): RelationshipConstraint[] {
  const groups = new Map<
    string,
    {
      relationship: RelationshipConstraint;
      pairs: { localColumn: string; foreignColumn: string; position: number }[];
    }
  >();
  for (const column of table.columns) {
    for (const key of column.foreignKeys) {
      // Legacy records are independent single-column relationships. Never guess
      // that two records belong to a composite constraint.
      const id =
        key.constraintId ??
        JSON.stringify([
          column.name,
          key.foreignSchemaName,
          key.foreignTableName,
          key.foreignColumnName,
        ]);
      const groupId = JSON.stringify([
        key.constraintId === undefined ? "legacy" : "constraint",
        id,
      ]);
      let group = groups.get(groupId);
      if (!group) {
        group = {
          relationship: {
            constraintId: id,
            localSchema: schemaName,
            localTable: table.name,
            foreignSchema: key.foreignSchemaName,
            foreignTable: key.foreignTableName,
            columnPairs: [],
          },
          pairs: [],
        };
        groups.set(groupId, group);
      }
      if (
        group.relationship.foreignSchema !== key.foreignSchemaName ||
        group.relationship.foreignTable !== key.foreignTableName
      ) {
        throw new Error(`Inconsistent foreign key constraint ${id}`);
      }
      if (
        key.constraintId !== undefined &&
        (!Number.isInteger(key.columnPosition) || key.columnPosition! < 1)
      ) {
        throw new Error(
          `Missing or invalid column position for constraint ${id}`,
        );
      }
      group.pairs.push({
        localColumn: column.name,
        foreignColumn: key.foreignColumnName,
        position: key.columnPosition ?? 1,
      });
    }
  }
  return [...groups.values()].map(({ relationship, pairs }) => {
    pairs.sort((a, b) => a.position - b.position);
    if (pairs.some((pair, i) => pair.position !== i + 1)) {
      throw new Error(
        `Incomplete or duplicate column positions for constraint ${relationship.constraintId}`,
      );
    }
    return {
      ...relationship,
      columnPairs: pairs.map(({ localColumn, foreignColumn }) => ({
        localColumn,
        foreignColumn,
      })),
    };
  });
}

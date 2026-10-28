import type { DatabaseSchema } from ".";
import type { Relationship, TableColumn } from "./DatabaseDriver";
import inferRelationships, {
  areRelationshipDataTypesCompatible,
  type InferRelationshipsOptions,
} from "./inferRelationships";

export type ManualRelationship = {
  constraintId: string;
  localSchema: string;
  localTable: string;
  foreignSchema: string;
  foreignTable: string;
  columnPairs: { localColumn: string; foreignColumn: string }[];
};

export type SchemaOptions = {
  inferRelationships?: boolean | InferRelationshipsOptions | undefined;
  relationships?: ManualRelationship[] | undefined;
  excludedRelationships?: string[] | undefined;
};

export function configuredRelationships(
  columns: TableColumn[],
  declared: Relationship[],
  options: SchemaOptions = {},
) {
  const seenIds = new Set<string>();
  const seenEndpoints = new Set<string>();
  const manual = (options.relationships ?? []).flatMap(
    (relationship): Relationship[] => {
      const label = `${relationship.localSchema}.${relationship.localTable} → ${relationship.foreignSchema}.${relationship.foreignTable}`;
      const endpoints = JSON.stringify([
        relationship.localSchema,
        relationship.localTable,
        relationship.foreignSchema,
        relationship.foreignTable,
        [...relationship.columnPairs].sort((a, b) =>
          a.localColumn.localeCompare(b.localColumn),
        ),
      ]);
      if (
        seenIds.has(relationship.constraintId) ||
        seenEndpoints.has(endpoints)
      )
        throw new Error(`Duplicate manual relationship ${label}.`);
      seenIds.add(relationship.constraintId);
      seenEndpoints.add(endpoints);
      const local = columns.filter(
        (column) =>
          column.schemaName === relationship.localSchema &&
          column.tableName === relationship.localTable,
      );
      const foreign = columns.filter(
        (column) =>
          column.schemaName === relationship.foreignSchema &&
          column.tableName === relationship.foreignTable,
      );
      const primaryKeys = foreign.filter(
        (column) => column.includedInPrimaryKey,
      );
      if (
        !relationship.constraintId.startsWith("manual:") ||
        !relationship.columnPairs.length ||
        primaryKeys.length !== relationship.columnPairs.length ||
        new Set(relationship.columnPairs.map((pair) => pair.localColumn))
          .size !== relationship.columnPairs.length ||
        new Set(relationship.columnPairs.map((pair) => pair.foreignColumn))
          .size !== primaryKeys.length ||
        primaryKeys.some(
          (key) =>
            !relationship.columnPairs.some(
              (pair) => pair.foreignColumn === key.name,
            ),
        )
      )
        throw new Error(
          `Manual relationship ${label} must reference a complete primary key.`,
        );
      return relationship.columnPairs.map((pair, index) => {
        const a = local.find((column) => column.name === pair.localColumn);
        const b = foreign.find((column) => column.name === pair.foreignColumn);
        if (!a || !b || !areRelationshipDataTypesCompatible(a, b))
          throw new Error(
            `Missing columns or incompatible data types in manual relationship ${label}.`,
          );
        return {
          ...relationship,
          ...pair,
          columnPosition: index + 1,
          source: "manual",
          confidence: 1,
        };
      });
    },
  );
  const inferred = options.inferRelationships
    ? inferRelationships(
        columns,
        [...declared, ...manual],
        options.inferRelationships === true ? {} : options.inferRelationships,
      )
    : [];
  const excluded = new Set(options.excludedRelationships);
  return [...declared, ...manual, ...inferred].filter(
    (relationship) =>
      relationship.source !== "inferred" ||
      !excluded.has(relationship.constraintId!),
  );
}

/** Filter both directions and all pairs of a constraint before graph construction. */
export function filterRelationshipsByConfidence(
  schemas: DatabaseSchema[],
  minimum = 0,
): DatabaseSchema[] {
  if (!Number.isFinite(minimum) || minimum < 0 || minimum > 1)
    throw new Error("Minimum relationship confidence must be between 0 and 1.");
  const rejected = new Set<string>();
  for (const schema of schemas)
    for (const table of schema.tables)
      for (const column of table.columns)
        for (const key of column.foreignKeys)
          if (key.confidence < minimum && key.constraintId !== undefined)
            rejected.add(
              JSON.stringify([schema.name, table.name, key.constraintId]),
            );
  return schemas.map((schema) => ({
    ...schema,
    tables: schema.tables.map((table) => ({
      ...table,
      columns: table.columns.map((column) => ({
        ...column,
        foreignKeys: column.foreignKeys.filter(
          (key) =>
            key.confidence >= minimum &&
            !rejected.has(
              JSON.stringify([schema.name, table.name, key.constraintId]),
            ),
        ),
        foreignKeyReferences: column.foreignKeyReferences.filter(
          (key) =>
            key.confidence >= minimum &&
            !rejected.has(
              JSON.stringify([
                key.localSchemaName,
                key.localTableName,
                key.constraintId,
              ]),
            ),
        ),
      })),
    })),
  }));
}

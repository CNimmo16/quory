import pluralize from "pluralize";
import type { Relationship, TableColumn } from "./DatabaseDriver";

export type InferRelationshipsOptions = {
  crossSchema?: boolean | undefined;
  pluralConversion?: boolean | undefined;
  multipleCandidateBehaviour?: "skip" | "error" | undefined;
  identicalDataTypesOnly?: boolean | undefined;
};

export type RelationshipSource = "foreign-key" | "inferred" | "manual";

/** Stable across discovery order and inference setting changes. */
export function relationshipId(
  source: "inferred" | "manual",
  relationship: Omit<Relationship, "constraintId">,
) {
  return `${source}:${JSON.stringify([
    relationship.localSchema,
    relationship.localTable,
    relationship.localColumn,
    relationship.foreignSchema,
    relationship.foreignTable,
    relationship.foreignColumn,
  ])}`;
}

const compatibleFamilies = [
  [
    "smallint",
    "integer",
    "int",
    "int2",
    "int4",
    "int8",
    "bigint",
    "tinyint",
    "mediumint",
    "serial",
    "bigserial",
    "smallserial",
  ],
  ["numeric", "decimal"],
  ["real", "float", "double", "double precision", "float4", "float8"],
  [
    "text",
    "varchar",
    "character varying",
    "char",
    "character",
    "nvarchar",
    "nchar",
    "tinytext",
    "mediumtext",
    "longtext",
  ],
  ["boolean", "bool"],
  ["blob", "bytea", "binary", "varbinary"],
];

/** Deliberately narrower than genericDataType: UUIDs, enums and dates aren't text. */
export function areRelationshipDataTypesCompatible(
  local: Pick<TableColumn, "dataType" | "genericDataType">,
  foreign: Pick<TableColumn, "dataType" | "genericDataType">,
  identicalDataTypesOnly = false,
) {
  const opaqueTypes = new Set(["", "user-defined", "array", "enum", "set"]);
  if (
    opaqueTypes.has(local.dataType.toLowerCase().trim()) ||
    opaqueTypes.has(foreign.dataType.toLowerCase().trim())
  )
    return false;
  if (local.dataType === foreign.dataType) return true;
  if (identicalDataTypesOnly) return false;
  const normalize = (type: string) =>
    type
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ")
      .replace(
        /^(varchar|char|character varying|character|nvarchar|nchar|numeric|decimal)\s*\(\s*\d+(?:\s*,\s*\d+)?\s*\)$/,
        "$1",
      );
  const a = normalize(local.dataType);
  const b = normalize(foreign.dataType);
  if (a === b) return true;
  // Don't strip array, unsigned, domain or precision information indiscriminately.
  return compatibleFamilies.some(
    (family) => family.includes(a) && family.includes(b),
  );
}

export default function inferRelationships(
  columns: TableColumn[],
  declaredRelationships: Relationship[] = [],
  options: InferRelationshipsOptions = {},
): Relationship[] {
  const tables = new Map<string, TableColumn[]>();
  for (const column of columns) {
    const key = JSON.stringify([column.schemaName, column.tableName]);
    const table = tables.get(key) ?? [];
    table.push(column);
    tables.set(key, table);
  }
  const destinations = new Map<string, TableColumn[]>();
  for (const table of tables.values()) {
    const keys = table.filter((column) => column.includedInPrimaryKey);
    if (keys.length !== 1) continue;
    const key = keys[0]!;
    const tableNames = new Set([
      key.tableName,
      ...(options.pluralConversion === false
        ? []
        : [pluralize.singular(key.tableName)]),
    ]);
    for (const name of tableNames) {
      const candidateName = `${name}_${key.name}`;
      const candidates = destinations.get(candidateName) ?? [];
      candidates.push(key);
      destinations.set(candidateName, candidates);
    }
  }
  const declaredColumns = new Set(
    declaredRelationships.map((key) =>
      JSON.stringify([key.localSchema, key.localTable, key.localColumn]),
    ),
  );
  const inferred: Relationship[] = [];
  for (const column of columns) {
    if (
      declaredColumns.has(
        JSON.stringify([column.schemaName, column.tableName, column.name]),
      )
    )
      continue;
    const candidates = (destinations.get(column.name) ?? []).filter(
      (key) =>
        (options.crossSchema || column.schemaName === key.schemaName) &&
        !(
          column.schemaName === key.schemaName &&
          column.tableName === key.tableName &&
          column.name === key.name
        ) &&
        areRelationshipDataTypesCompatible(
          column,
          key,
          options.identicalDataTypesOnly,
        ),
    );
    if (candidates.length > 1) {
      if (options.multipleCandidateBehaviour === "error")
        throw new Error(
          `Ambiguous inferred relationship for ${column.schemaName}.${column.tableName}.${column.name}: ${candidates
            .map((key) => `${key.schemaName}.${key.tableName}.${key.name}`)
            .sort()
            .join(", ")}`,
        );
      continue;
    }
    const key = candidates[0];
    if (!key) continue;
    const relationship: Relationship = {
      localSchema: column.schemaName,
      localTable: column.tableName,
      localColumn: column.name,
      foreignSchema: key.schemaName,
      foreignTable: key.tableName,
      foreignColumn: key.name,
      columnPosition: 1,
      source: "inferred",
      // A rule score, not a statistical probability. No data sampling is performed.
      confidence: Number(
        (
          (column.name === `${key.tableName}_${key.name}` ? 0.95 : 0.9) -
          (column.dataType === key.dataType ? 0 : 0.05)
        ).toFixed(2),
      ),
    };
    inferred.push({
      ...relationship,
      constraintId: relationshipId("inferred", relationship),
    });
  }
  return inferred;
}

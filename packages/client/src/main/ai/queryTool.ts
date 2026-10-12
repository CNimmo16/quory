import { z } from "zod";
import {
  ConditionOperator,
  prepareQuery,
  validateQuery,
  type Condition,
  type DatabaseSchema,
  type DatabaseTableInfo,
  type JoinDef,
  type Query,
} from "@quory/core";

// Flat arrays avoid recursive JSON schemas, which are not supported by every
// provider. Parent/child indexes preserve the app's full join and filter trees.
const filterNode = z
  .object({
    operator: z.nativeEnum(ConditionOperator),
    column: z
      .string()
      .nullable()
      .describe("Column name for a comparison; null for and/or."),
    values: z
      .array(z.string())
      .describe(
        "One value for a scalar comparison; multiple for in/not in; empty for and/or."
      ),
    children: z
      .array(z.number().int().nonnegative())
      .describe("Indexes of child conditions for and/or; empty otherwise."),
  })
  .strict();
export const upsertQuerySchema = z
  .object({
    nickname: z.string().min(1).max(120),
    summary: z
      .string()
      .min(1)
      .max(2000)
      .describe(
        "Brief user-facing explanation of the query and any changes, including filters and ordering."
      ),
    limit: z.number().int().min(1).max(1000),
    tables: z
      .array(
        z
          .object({
            tableRef: z
              .string()
              .describe("Exact schema.table from the database schema."),
            parent: z
              .number()
              .int()
              .nonnegative()
              .nullable()
              .describe(
                "null for the first/base table. Other tables reference an earlier table's array index."
              ),
            columns: z
              .array(z.string())
              .describe(
                "['*'] for all columns; [] for a relationship used only to filter; otherwise exact column names."
              ),
            via: z
              .array(z.string())
              .describe(
                "Intermediate schema.table references in order; excludes parent and destination; [] for the default relationship path."
              ),
            conditions: z
              .array(filterNode)
              .max(80)
              .describe(
                "No filters: []. Otherwise index 0 is the root; and/or nodes reference later child indexes. Every node must be used."
              ),
            orderBy: z.array(
              z
                .object({
                  column: z.string(),
                  direction: z.enum(["asc", "desc"]),
                  priority: z.number().int().nonnegative(),
                })
                .strict()
            ),
          })
          .strict()
      )
      .min(1)
      .max(16),
  })
  .strict();
export type UpsertQueryInput = z.infer<typeof upsertQuerySchema>;

export function queryFromTool(input: UpsertQueryInput): Query {
  const joins: JoinDef[] = input.tables.map((table) => {
    const visited = new Set<number>();
    function conditionAt(index: number): Condition {
      const node = table.conditions[index];
      if (!node || visited.has(index))
        throw new Error("Invalid or repeated filter child index.");
      visited.add(index);
      if (
        node.operator === ConditionOperator.AND ||
        node.operator === ConditionOperator.OR
      ) {
        if (
          node.column !== null ||
          node.values.length ||
          !node.children.length ||
          node.children.some((child) => child <= index)
        )
          throw new Error(
            "Boolean filters need later child indexes and no column or values."
          );
        return {
          operator: node.operator,
          conditions: node.children.map(conditionAt),
        };
      }
      if (!node.column || node.children.length)
        throw new Error("Comparisons need a column and no child conditions.");
      if (
        node.operator === ConditionOperator.IN ||
        node.operator === ConditionOperator.NOT_IN
      ) {
        if (!node.values.length)
          throw new Error("List filters need at least one value.");
        return {
          column: node.column,
          operator: node.operator,
          values: node.values,
        };
      }
      if (node.values.length !== 1)
        throw new Error("Scalar filters need exactly one value.");
      return {
        column: node.column,
        operator: node.operator,
        value: node.values[0]!,
      };
    }
    const where = table.conditions.length ? conditionAt(0) : undefined;
    if (visited.size !== table.conditions.length)
      throw new Error("Some filter conditions are not attached to the root.");
    return {
      tableRef: table.tableRef,
      select:
        table.columns.length === 1 && table.columns[0] === "*"
          ? "*"
          : table.columns,
      via: table.via,
      where,
      orderBy: table.orderBy,
      joins: [],
    };
  });
  input.tables.forEach((table, index) => {
    if (index === 0) {
      if (table.parent !== null || table.via.length)
        throw new Error("The base table cannot have a parent or via path.");
    } else {
      if (table.parent === null || table.parent >= index)
        throw new Error("Each joined table must reference an earlier parent.");
      joins[table.parent]!.joins!.push(joins[index]!);
    }
  });
  return { base: joins[0]!, limit: input.limit };
}

export async function validateAssistantQuery(
  schemas: DatabaseSchema[],
  query: Query
) {
  const tables = new Map<string, DatabaseTableInfo>(
    schemas.flatMap((schema) =>
      schema.tables.map(
        (table) => [`${schema.name}.${table.name}`, table] as const
      )
    )
  );
  validateQuery(schemas, query);
  if (query.limit !== undefined && query.limit > 1000)
    throw new Error("Choose a row limit between 1 and 1000.");
  // Compiles only; verifies the existing engine can resolve the relationship paths.
  const { joinsList } = await prepareQuery(schemas, query);
  for (const join of joinsList) {
    if (!join.parent) continue;
    const refsBetween = (from: string, to: string) =>
      tables
        .get(from)!
        .columns.flatMap((column) =>
          column.foreignKeys.filter(
            (key) => `${key.foreignSchemaName}.${key.foreignTableName}` === to
          )
        );
    if (
      refsBetween(join.tableRef, join.parent.tableRef).length +
        refsBetween(join.parent.tableRef, join.tableRef).length >
      1
    ) {
      throw new Error(
        `Multiple relationships connect ${join.parent.tableRef} and ${join.tableRef}. The visual builder cannot choose a specific foreign key; do not silently select one.`
      );
    }
  }
}

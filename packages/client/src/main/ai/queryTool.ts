import { z } from "zod";
import {
  ConditionOperator,
  isBooleanCondition,
  isListCondition,
  prepareQuery,
  normalizeVia,
  type Condition,
  type DatabaseSchema,
  type DatabaseTableInfo,
  type JoinDef,
  type Query,
} from "@quory/core";

// Flat arrays avoid recursive JSON schemas, which are not supported by every
// provider. Parent/child indexes preserve the app's full join and filter trees.
const viaStep = z.union([
  z.string(),
  z
    .object({
      tableRef: z.string(),
      fromColumnName: z.string().min(1).optional(),
      toColumnName: z.string().min(1).optional(),
    })
    .strict(),
  z
    .object({ tableRef: z.string(), usingConstraintId: z.string().min(1) })
    .strict(),
]);

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
              .array(viaStep)
              .describe(
                "Ordered table waypoints: strings or objects with tableRef and optional fromColumnName/toColumnName or usingConstraintId (never both). Either column name alone is allowed if unambiguous. Include destination as the final step to select its incoming relationship; [] for the default path."
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
  let count = 0;
  let selected = false;
  function checkJoin(join: JoinDef) {
    if (++count > 32) throw new Error("Too many joined tables.");
    const table = tables.get(join.tableRef);
    if (!table)
      throw new Error(
        `Unknown table ${join.tableRef}. Use only tables in the supplied schema.`
      );
    const identifiers = join.tableRef.split(".");
    if (
      identifiers.length !== 2 ||
      identifiers.some((name) => !/^[a-zA-Z_][a-zA-Z0-9_$]*$/.test(name))
    )
      throw new Error(
        `The query builder does not support this table identifier: ${join.tableRef}.`
      );
    const checkColumn = (column: string) => {
      if (
        !table.columns.some((item) => item.name === column) ||
        !/^[a-zA-Z_][a-zA-Z0-9_$]*$/.test(column)
      )
        throw new Error(
          `Unknown or unsupported column ${join.tableRef}.${column}.`
        );
    };
    if (join.select === "*")
      table.columns.forEach((column) => checkColumn(column.name));
    else join.select.forEach(checkColumn);
    selected ||= join.select.length > 0;
    (join.orderBy ?? []).forEach((order) => checkColumn(order.column));
    normalizeVia(join.via).forEach(({ tableRef: ref }) => {
      if (!tables.has(ref))
        throw new Error(`Unknown intermediate table ${ref}.`);
    });
    function checkCondition(condition: Condition, depth = 0) {
      if (depth > 20) throw new Error("Filter nesting is too deep.");
      if (isBooleanCondition(condition)) {
        if (!condition.conditions.length)
          throw new Error("Empty boolean filter.");
        condition.conditions.forEach((child) =>
          checkCondition(child, depth + 1)
        );
      } else {
        checkColumn(condition.column);
        const values = isListCondition(condition)
          ? condition.values
          : [condition.value];
        if (!values.length) throw new Error("Empty list filter.");
        if (values.some((value) => /[\\\0]/.test(value)))
          throw new Error(
            "Backslashes and null bytes in filter values are not supported by this query builder."
          );
      }
    }
    if (join.where) checkCondition(join.where);
    (join.joins ?? []).forEach(checkJoin);
  }
  checkJoin(query.base);
  if (!selected) throw new Error("Select at least one column.");
  if (
    query.limit !== undefined &&
    (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 1000)
  )
    throw new Error("Choose a row limit between 1 and 1000.");
  // Compiles only; verifies the existing engine can resolve the relationship paths.
  const { preparedQuery } = await prepareQuery(schemas, query);
  count = 0;
  checkJoin(preparedQuery.base);
}

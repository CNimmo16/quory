import normalizeVia, { type ViaStep } from "./util/normalizeVia";
import type { DatabaseSchema } from ".";
import {
  booleanConditionOperators,
  listConditionOperators,
  valueConditionOperators,
  type Query,
  type ConditionOperator,
} from "./prepareQuery";
import splitTableRef from "./util/splitTableRef";
import findTableFromSchemas from "./util/findTableFromSchemas";

/** Runtime boundary for every query source, including callers bypassing HTTP. */
export default function validateQuery(
  schemas: DatabaseSchema[],
  input: unknown
): asserts input is Query {
  const object = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Expected a query object.");
    return value as Record<string, unknown>;
  };
  const fields = (value: Record<string, unknown>, allowed: string[]) => {
    if (Object.keys(value).some((key) => !allowed.includes(key)))
      throw new Error("Unexpected query field.");
  };
  const strings = (value: unknown): string[] => {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
      throw new Error("Expected an array of strings.");
    return value;
  };
  const tableFor = (ref: unknown) => {
    if (typeof ref !== "string") throw new Error("Invalid table reference.");
    const [schema, table] = splitTableRef(ref);
    return findTableFromSchemas(schemas, schema, table);
  };
  const query = object(input);
  if (
    query.limit !== undefined &&
    (typeof query.limit !== "number" ||
      !Number.isSafeInteger(query.limit) ||
      query.limit < 1 ||
      query.limit > 100)
  )
    throw new Error(
      "Row limit must be a positive safe integer of at most 100."
    );
  if (
    query.offset !== undefined &&
    (typeof query.offset !== "number" ||
      !Number.isSafeInteger(query.offset) ||
      query.offset < 0)
  )
    throw new Error("Row offset must be a nonnegative safe integer.");
  let joinCount = 0;
  let conditionCount = 0;
  let selected = false;
  function checkJoin(joinInput: unknown) {
    if (++joinCount > 32) throw new Error("Too many joined tables.");
    const join = object(joinInput);
    const table = tableFor(join.tableRef);
    const checkColumn = (column: unknown) => {
      if (
        typeof column !== "string" ||
        !table.columns.some((item) => item.name === column)
      )
        throw new Error(
          `Unknown or unsupported column ${join.tableRef}.${String(column)}.`
        );
    };
    if (join.select === "*") selected ||= table.columns.length > 0;
    else {
      const columns = strings(join.select);
      columns.forEach(checkColumn);
      selected ||= columns.length > 0;
    }
    if (join.via !== undefined) {
      if (!Array.isArray(join.via)) throw new Error("Invalid via route.");
      for (const step of join.via) {
        if (typeof step !== "string")
          fields(object(step), [
            "tableRef",
            "fromColumnName",
            "toColumnName",
            "usingConstraintId",
          ]);
      }
      normalizeVia(join.via as ViaStep[]).forEach((step) =>
        tableFor(step.tableRef)
      );
    }
    if (join.orderBy !== undefined) {
      if (!Array.isArray(join.orderBy)) throw new Error("Invalid ordering.");
      join.orderBy.forEach((value) => {
        const order = object(value);
        fields(order, ["column", "direction", "priority"]);
        checkColumn(order.column);
        if (order.direction !== "asc" && order.direction !== "desc")
          throw new Error("Invalid sort direction.");
        if (
          order.priority !== undefined &&
          (typeof order.priority !== "number" ||
            !Number.isSafeInteger(order.priority) ||
            order.priority < 0)
        )
          throw new Error("Invalid sort priority.");
      });
    }
    function checkCondition(value: unknown, depth = 0) {
      if (++conditionCount > 256 || depth > 20)
        throw new Error("Filter nesting or size is too large.");
      const condition = object(value);
      if (
        booleanConditionOperators.includes(
          condition.operator as ConditionOperator
        )
      ) {
        fields(condition, ["operator", "conditions"]);
        if (
          !Array.isArray(condition.conditions) ||
          !condition.conditions.length
        )
          throw new Error("Empty or invalid boolean filter.");
        condition.conditions.forEach((child) =>
          checkCondition(child, depth + 1)
        );
      } else {
        checkColumn(condition.column);
        if (
          listConditionOperators.includes(
            condition.operator as ConditionOperator
          )
        ) {
          fields(condition, ["operator", "column", "values"]);
          if (!strings(condition.values).length)
            throw new Error("Empty list filter.");
        } else if (
          valueConditionOperators.includes(
            condition.operator as ConditionOperator
          )
        ) {
          fields(condition, ["operator", "column", "value"]);
          if (typeof condition.value !== "string")
            throw new Error("Filter value must be a string.");
        } else throw new Error("Invalid filter operator.");
      }
    }
    if (join.where !== undefined) checkCondition(join.where);
    if (join.joins !== undefined) {
      if (!Array.isArray(join.joins)) throw new Error("Invalid joins.");
      join.joins.forEach(checkJoin);
    }
  }
  checkJoin(query.base);
  if (!selected) throw new Error("Select at least one column.");
}

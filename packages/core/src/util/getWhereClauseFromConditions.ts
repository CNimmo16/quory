import { DatabaseTableInfo } from "..";
import { Condition, ConditionOperator } from "../prepareQuery";

export default function getWhereClauseFromConditions(
  table: DatabaseTableInfo & {
    schemaName: string;
  },
  tableAlias: string | null,
  where: Condition
) {
  if (!tableAlias) {
    tableAlias = `${table.schemaName}.${table.name}`;
  }
  function makeCondition(condition: Condition): string {
    if (
      "column" in condition &&
      !table.columns.some((column) => column.name === condition.column)
    ) {
      throw new Error(
        `Where clause references column ${table.schemaName}.${table.name}.${condition.column} which does not exist`
      );
    }
    switch (condition.operator) {
      case ConditionOperator.AND:
      case ConditionOperator.OR:
        return `(${condition.conditions
          .map(makeCondition)
          .join(` ${condition.operator.toUpperCase()} `)})`;
      default:
        return `${tableAlias}.${
          condition.column
        } ${condition.operator.toUpperCase()} ${
          "value" in condition
            ? `'${condition.value}'`
            : `(${condition.values.map((value) => `'${value}'`).join(",")})`
        }`;
    }
  }
  return makeCondition(where);
}

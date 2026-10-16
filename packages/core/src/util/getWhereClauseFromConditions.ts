import { DatabaseTableInfo } from "..";
import {
  SqlDialect,
  SqlParameter,
  quoteIdentifier,
  parameterPlaceholder,
} from "../sqlDialect";
import { Condition, ConditionOperator } from "../prepareQuery";

export default function getWhereClauseFromConditions(
  table: DatabaseTableInfo & {
    schemaName: string;
  },
  tableAlias: string | null,
  where: Condition,
  dialect: SqlDialect,
  parameters: SqlParameter[],
) {
  const q = (name: string) => quoteIdentifier(name, dialect);
  const ref = tableAlias
    ? q(tableAlias)
    : `${q(table.schemaName)}.${q(table.name)}`;
  const bindValue = (value: string) => {
    parameters.push(value);
    return parameterPlaceholder(parameters.length, dialect);
  };
  function makeCondition(condition: Condition): string {
    if (
      "column" in condition &&
      !table.columns.some((column) => column.name === condition.column)
    ) {
      throw new Error(
        `Where clause references column ${table.schemaName}.${table.name}.${condition.column} which does not exist`,
      );
    }
    switch (condition.operator) {
      case ConditionOperator.AND:
      case ConditionOperator.OR:
        return `(${condition.conditions
          .map(makeCondition)
          .join(` ${condition.operator.toUpperCase()} `)})`;
      default:
        return `${ref}.${q(
          condition.column,
        )} ${condition.operator.toUpperCase()} ${
          "value" in condition
            ? bindValue(condition.value)
            : `(${condition.values.map(bindValue).join(",")})`
        }`;
    }
  }
  return makeCondition(where);
}

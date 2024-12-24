import { DatabaseTableInfo } from "..";
import { WhereCondition } from "../fetchRelatedRows";

export default function getWhereClauseFromConditions(
  table: DatabaseTableInfo & {
    schemaName: string;
  },
  tableAlias: string | null,
  where: {
    [column: string]: WhereCondition;
  }
) {
  if (!tableAlias) {
    tableAlias = `${table.schemaName}.${table.name}`;
  }
  return Object.entries(where).map(function makeCondition([
    columnName,
    condition,
  ]): string {
    if (!table.columns.some((column) => column.name === columnName)) {
      throw new Error(
        `Where clause references column ${table.schemaName}.${table.name}.${columnName} which does not exist`
      );
    }
    if (typeof condition === "string") {
      return `${tableAlias}.${columnName} = '${condition}'`;
    } else {
      switch (condition.operator) {
        case "and":
        case "or":
          return `(${condition.conditions
            .map((subCondition): string => {
              return makeCondition([columnName, subCondition]);
            })
            .join(` ${condition.operator.toUpperCase()} `)})`;
        default:
          return `${tableAlias}.${columnName} ${condition.operator.toUpperCase()} '${
            condition.value
          }'`;
      }
    }
  });
}

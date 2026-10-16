import { quoteIdentifier, type SqlDialect } from "../sqlDialect";
import { DatabaseTableInfo } from "..";

export default function getSelectForColumn(
  table: DatabaseTableInfo & {
    schemaName: string;
  },
  tableAlias: string,
  column: DatabaseTableInfo["columns"][number],
  resultAlias?: string,
  dialect: SqlDialect = "sqlite",
) {
  return {
    name: column.name,
    ref: `${quoteIdentifier(tableAlias, dialect)}.${quoteIdentifier(
      column.name,
      dialect,
    )}`,
    subQueryAlias: `${tableAlias}__${column.name}`,
    outerAlias: resultAlias ?? `${tableAlias}__${column.name}`,
    includeInOuter: true,
  };
}

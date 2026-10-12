import { quoteIdentifier, type SqlDialect } from "../sqlDialect";
import { DatabaseTableInfo } from "..";

export default function getSelectForColumn(
  table: DatabaseTableInfo & {
    schemaName: string;
  },
  tableAlias: string,
  column: DatabaseTableInfo["columns"][number],
  dialect: SqlDialect = "sqlite"
) {
  return {
    name: column.name,
    ref: `${quoteIdentifier(tableAlias, dialect)}.${quoteIdentifier(
      column.name,
      dialect
    )}`,
    subQueryAlias: `${tableAlias}__${column.name}`,
    outerAlias: `${table.schemaName}__${table.name}__${column.name}`,
    includeInOuter: true,
  };
}

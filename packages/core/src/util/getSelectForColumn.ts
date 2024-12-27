import { DatabaseTableInfo } from "..";

export default function getSelectForColumn(
  table: DatabaseTableInfo & {
    schemaName: string;
  },
  tableAlias: string,
  column: DatabaseTableInfo["columns"][number]
) {
  return {
    name: column.name,
    ref: `${tableAlias}.${column.name}`,
    subQueryAlias: `${tableAlias}__${column.name}`,
    outerAlias: `${table.schemaName}__${table.name}__${column.name}`,
    includeInOuter: true,
  };
}

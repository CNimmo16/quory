import { DatabaseTableInfo } from "..";

export default function getSelectForColumn(
  table: DatabaseTableInfo & {
    schemaName: string;
  },
  tableAlias: string,
  column: DatabaseTableInfo["columns"][number],
  resultAlias?: string
) {
  return {
    name: column.name,
    ref: `${tableAlias}.${column.name}`,
    subQueryAlias: `${tableAlias}__${column.name}`,
    outerAlias: resultAlias ?? `${tableAlias}__${column.name}`,
    includeInOuter: true,
  };
}

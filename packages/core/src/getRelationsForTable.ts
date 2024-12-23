import { shortestPath } from "graph-data-structure";
import type { DatabaseSchema, DatabaseTableInfo } from ".";
import makeGraphForDatabase from "../util/makeGraphForDatabase";
import findTableFromSchemas from "./util/findTableFromSchemas";

export default function getRelationsForTable(
  databaseSchemas: DatabaseSchema[],
  schemaName: string,
  tableName: string,
  maxJoins?: number
): (DatabaseTableInfo & {
  schemaName: string;
  shortestJoinPath: number;
})[] {
  const table = findTableFromSchemas(databaseSchemas, schemaName, tableName);

  if (
    table.columns.every(
      (column) =>
        column.foreignKeys.length === 0 &&
        column.foreignKeyReferences.length === 0
    )
  ) {
    throw new Error(
      `No relationships found for table ${schemaName}.${tableName}`
    );
  }

  const graph = makeGraphForDatabase(databaseSchemas);

  return databaseSchemas
    .flatMap((schema) =>
      schema.tables
        .filter(({ name }) => name !== tableName)
        .map((_table) => ({ ..._table, schemaName: schema.name }))
    )
    .map((foreignTable) => {
      try {
        const { weight: shortestJoinPath } = shortestPath(
          graph,
          `${schemaName}.${tableName}`,
          `${foreignTable.schemaName}.${foreignTable.name}`
        );
        if (maxJoins && shortestJoinPath > maxJoins) {
          return null;
        }
        return {
          ...foreignTable,
          schemaName: foreignTable.schemaName,
          shortestJoinPath,
        };
      } catch {
        // no path between tables
        return null;
      }
    })
    .filter((_table) => _table !== null);
}

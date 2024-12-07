import { shortestPath } from "graph-data-structure";
import { Row } from ".";
import type { DatabaseSchema } from ".";
import makeGraphForDatabase from "../util/makeGraphForDatabase";
import findTableFromSchemas from "./util/findTable";

export default function getRelationsForTable(
  databaseSchemas: DatabaseSchema[],
  schemaName: string,
  tableName: string,
  maxJoins?: number
): {
  schemaName: string;
  tableName: string;
  shortestJoinPath: number;
}[] {
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
        .filter((table) => table.name !== tableName)
        .map((table) => ({ ...table, schemaName: schema.name }))
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
          schemaName: foreignTable.schemaName,
          tableName: foreignTable.name,
          shortestJoinPath,
        };
      } catch {
        // no path between tables
        return null;
      }
    })
    .filter((table) => table !== null);
}

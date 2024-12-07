import { DatabaseSchema, DatabaseTableInfo } from "../src";
import { Graph, Serialized } from "graph-data-structure";

import { compareTwoStrings } from "string-similarity";

export default function makeGraphForDatabase(
  databaseSchemas: {
    name: string;
    tables: {
      name: string;
      columns: Pick<
        DatabaseTableInfo["columns"][number],
        "name" | "foreignKeys" | "foreignKeyReferences"
      >[];
    }[];
  }[],
  ignoreTables: {
    schemaName: string;
    tableName: string;
  }[] = []
) {
  const links = databaseSchemas.flatMap(({ name: schemaName, tables }) =>
    tables
      .filter(
        ({ name: tableName }) =>
          !ignoreTables.some(
            (table) =>
              table.schemaName === schemaName && table.tableName === tableName
          )
      )
      .flatMap(({ name: tableName, columns }) => {
        return [
          ...columns.flatMap((column) =>
            column.foreignKeys.map((key) => ({
              source: `${schemaName}.${tableName}`,
              target: `${key.foreignSchemaName}.${key.foreignTableName}`,
              weight: 1 - compareTwoStrings(key.foreignTableName, tableName),
            }))
          ),
          ...columns.flatMap((column) =>
            column.foreignKeyReferences.map((key) => ({
              source: `${schemaName}.${tableName}`,
              target: `${key.localSchemaName}.${key.localTableName}`,
              weight: 1 - compareTwoStrings(key.localTableName, tableName),
            }))
          ),
        ];
      })
  );
  const nodes = databaseSchemas.flatMap(({ name: schemaName, tables }) =>
    tables.map(({ name: tableName, columns }) => `${schemaName}.${tableName}`)
  );
  const graph = new Graph();
  nodes.forEach((node) => graph.addNode(node));
  links.forEach(({ source, target }) => graph.addEdge(source, target));
  return graph;
}

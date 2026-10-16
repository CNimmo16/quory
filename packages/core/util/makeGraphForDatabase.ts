import { DatabaseTableInfo } from "../src";
import { Graph } from "graph-data-structure";

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
  }[] = [],
) {
  const links = databaseSchemas.flatMap(({ name: schemaName, tables }) =>
    tables
      .filter(
        ({ name: tableName }) =>
          !ignoreTables.some(
            (table) =>
              table.schemaName === schemaName && table.tableName === tableName,
          ),
      )
      .flatMap(({ name: tableName, columns }) => {
        return [
          ...columns.flatMap((column) =>
            column.foreignKeys.map((key) => ({
              source: `${schemaName}.${tableName}`,
              target: `${key.foreignSchemaName}.${key.foreignTableName}`,
            })),
          ),
          ...columns.flatMap((column) =>
            column.foreignKeyReferences.map((key) => ({
              source: `${schemaName}.${tableName}`,
              target: `${key.localSchemaName}.${key.localTableName}`,
            })),
          ),
        ];
      }),
  );
  const nodes = databaseSchemas.flatMap(({ name: schemaName, tables }) =>
    tables.map(({ name: tableName }) => `${schemaName}.${tableName}`),
  );
  const graph = new Graph();
  nodes.forEach((node) => graph.addNode(node));
  // Connectivity is table-level; constraint identity is resolved for each
  // planned edge by prepareQuery, where parallel constraints are rejected.
  const seenEdges = new Set<string>();
  links.forEach(({ source, target }) => {
    const edge = JSON.stringify([source, target]);
    if (!seenEdges.has(edge)) graph.addEdge(source, target);
    seenEdges.add(edge);
  });
  return graph;
}

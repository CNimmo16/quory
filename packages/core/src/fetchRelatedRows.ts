import { shortestPath } from "graph-data-structure";
import { DatabaseDriver, Row } from ".";
import type { DatabaseSchema } from ".";
import makeGraphForDatabase from "../util/makeGraphForDatabase";
import findTableFromSchemas from "./util/findTable";

export default async function fetchRelatedRows(
  databaseDriver: DatabaseDriver,
  databaseSchemas: DatabaseSchema[],
  args: {
    localSchema: string;
    localTable: string;
    localRowData: Row;
    foreignSchema?: string;
    foreignTable: string;
  }
): Promise<{
  sql: string;
  rowData: Row[];
}> {
  const { localSchema, localTable, localRowData, foreignSchema, foreignTable } =
    args;

  if (
    findTableFromSchemas(
      databaseSchemas,
      localSchema,
      localTable
    ).columns.every(
      (column) =>
        column.foreignKeys.length === 0 &&
        column.foreignKeyReferences.length === 0
    )
  ) {
    throw new Error(`No relationships found for table ${localTable}`);
  }

  const graph = makeGraphForDatabase(databaseSchemas);

  const { nodes: path } = shortestPath(
    graph,
    `${localSchema}.${localTable}`,
    `${foreignSchema}.${foreignTable}`
  );

  const sql =
    path.reduce((statement: string, table: string, index: number) => {
      const [schemaName, tableName] = table.split(".");
      if (!path[index + 1]) {
        return statement;
      }
      const [nextSchemaName, nextTableName] = path[index + 1].split(".");
      const thisTable = findTableFromSchemas(
        databaseSchemas,
        schemaName,
        tableName
      );
      const referenceFromThisTableToNextTable = thisTable.columns
        .flatMap((column) =>
          column.foreignKeys.map((ref) => ({
            ...ref,
            columnName: column.name,
          }))
        )
        .find(
          (reference) =>
            reference.foreignSchemaName === nextSchemaName &&
            reference.foreignTableName === nextTableName
        );
      if (referenceFromThisTableToNextTable) {
        return (
          statement +
          ` INNER JOIN ${nextSchemaName}.${nextTableName} ON ${nextSchemaName}.${nextTableName}.${referenceFromThisTableToNextTable.foreignColumnName} = ${schemaName}.${tableName}.${referenceFromThisTableToNextTable.columnName}`
        );
      }
      const nextTable = findTableFromSchemas(
        databaseSchemas,
        nextSchemaName,
        nextTableName
      );
      const referenceFromNextTableToThisTable = nextTable.columns
        .flatMap((column) =>
          column.foreignKeys.map((ref) => ({
            ...ref,
            columnName: column.name,
          }))
        )
        .find(
          (reference) =>
            reference.foreignSchemaName === schemaName &&
            reference.foreignTableName === tableName
        );
      if (referenceFromNextTableToThisTable) {
        return (
          statement +
          ` INNER JOIN ${nextSchemaName}.${nextTableName} ON ${nextSchemaName}.${nextTableName}.${referenceFromNextTableToThisTable.columnName} = ${schemaName}.${tableName}.${referenceFromNextTableToThisTable.foreignColumnName}`
        );
      }
      throw new Error(
        `Could not find relationship between ${table} and ${path[index + 1]}`
      );
    }, `SELECT * FROM ${localSchema}.${localTable}`) +
    Object.entries(localRowData).reduce((statement, [column, value], index) => {
      return (
        statement +
        ` ${
          index === 0 ? "WHERE" : "AND"
        } ${localSchema}.${localTable}.${column} = '${value}'`
      );
    }, "");

  return {
    sql,
    rowData: await databaseDriver.exec(sql),
  };
}

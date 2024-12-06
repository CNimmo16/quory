import { DatabaseInspectionDriver, Row } from "@quory/core";

import type { DatabaseSchema } from ".";
import makeGraphForDatabase from "../util/makeGraphForDatabase";

export default async function fetchRelatedRows(
  databaseInspectionDriver: DatabaseInspectionDriver,
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

  const findTable = (schemaName: string, tableName: string) => {
    const schema = databaseSchemas.find((schema) => schema.name === schemaName);

    if (!schema) {
      throw new Error(`Could not find schema ${schemaName}`);
    }
    const table = schema.tables.find((table) => table.name === tableName);

    if (!table) {
      throw new Error(`Could not find table ${schemaName}.${tableName}`);
    }
    return table;
  };

  if (
    findTable(localSchema, localTable).columns.every(
      (column) =>
        column.foreignKeys.length === 0 &&
        column.foreignKeyReferences.length === 0
    )
  ) {
    throw new Error(`No relationships found for table ${localTable}`);
  }

  const graph = makeGraphForDatabase(databaseSchemas);

  const path = graph.shortestPath(
    `${localSchema}.${localTable}`,
    `${foreignSchema}.${foreignTable}`
  ) as string[]; // always string[] not PathResult because { cost: false } passed

  const sql =
    path.reduce((statement: string, table: string, index: number) => {
      const [schemaName, tableName] = table.split(".");
      if (!path[index + 1]) {
        return statement;
      }
      const [nextSchemaName, nextTableName] = path[index + 1].split(".");
      const thisTable = findTable(schemaName, tableName);
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
      const nextTable = findTable(nextSchemaName, nextTableName);
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
    rowData: await databaseInspectionDriver.exec(sql),
  };
}

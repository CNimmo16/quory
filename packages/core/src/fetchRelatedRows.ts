import { shortestPath } from "graph-data-structure";
import { DatabaseDriver, Row } from ".";
import type { DatabaseSchema } from ".";
import makeGraphForDatabase from "../util/makeGraphForDatabase";
import findTableFromSchemas from "./util/findTable";
import { writeFileSync } from "fs";

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
  rows: {
    localTableData: Row;
    foreignTableData: Row;
    otherTables: {
      [tableName: string]: Row;
    };
  }[];
}> {
  const {
    localSchema,
    localTable: localTableName,
    localRowData,
    foreignSchema: foreignSchemaArg,
    foreignTable: foreignTableName,
  } = args;
  const foreignSchema = foreignSchemaArg || localSchema;

  const localTable = findTableFromSchemas(
    databaseSchemas,
    localSchema,
    localTableName
  );

  if (
    localTable.columns.every(
      (column) =>
        column.foreignKeys.length === 0 &&
        column.foreignKeyReferences.length === 0
    )
  ) {
    throw new Error(`No relationships found for table ${localTableName}`);
  }

  const graph = makeGraphForDatabase(databaseSchemas);

  const path = (() => {
    try {
      const { nodes } = shortestPath(
        graph,
        `${localSchema}.${localTableName}`,
        `${foreignSchema}.${foreignTableName}`
      );
      return nodes;
    } catch (err) {
      throw new Error(
        `Couldn't find a path from ${localSchema}.${localTableName} to ${foreignSchema}.${foreignTableName}`
      );
    }
  })();

  const joins = path.reduce(
    (statement: string, tableRef: string, index: number) => {
      const [schemaName, tableName] = tableRef.split(".");
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
        `Could not find relationship between ${tableRef} and ${path[index + 1]}`
      );
    },
    `${localSchema}.${localTableName}`
  );

  const select = path
    .flatMap((tableRef) => {
      const [schemaName, tableName] = tableRef.split(".");
      const table = findTableFromSchemas(
        databaseSchemas,
        schemaName,
        tableName
      );
      return table.columns.map(
        (column) =>
          `${schemaName}.${tableName}.${column.name} AS ${schemaName}__${tableName}__${column.name}`
      );
    })
    .join(", ");

  const where = Object.entries(localRowData)
    .map(([column, value]) => {
      return `${localSchema}.${localTableName}.${column} = '${value}'`;
    })
    .join(" AND ");

  const sql = `SELECT ${select} FROM ${joins} WHERE ${where};`;

  const execResult = await databaseDriver.exec(sql);

  return {
    sql,
    rows: execResult.map((row) => {
      const foreignTable = findTableFromSchemas(
        databaseSchemas,
        foreignSchema,
        foreignTableName
      );
      return {
        localTableData: Object.fromEntries(
          localTable.columns.map((column) => {
            return [
              column.name,
              row[`${localSchema}__${localTableName}__${column.name}`],
            ];
          })
        ),
        foreignTableData: Object.fromEntries(
          foreignTable.columns.map((column) => {
            return [
              column.name,
              row[`${foreignSchema}__${foreignTableName}__${column.name}`],
            ];
          })
        ),
        otherTables: Object.fromEntries(
          path
            .filter(
              (tableRef) =>
                tableRef !== `${localSchema}.${localTableName}` &&
                tableRef !== `${foreignSchema}.${foreignTableName}`
            )
            .map((tableRef) => {
              const [schemaName, tableName] = tableRef.split(".");
              const { columns } = findTableFromSchemas(
                databaseSchemas,
                schemaName,
                tableName
              );
              return [
                tableRef,
                Object.fromEntries(
                  columns.map((column) => {
                    return [
                      column.name,
                      row[`${schemaName}__${tableName}__${column.name}`],
                    ];
                  })
                ),
              ];
            })
        ),
      };
    }),
  };
}

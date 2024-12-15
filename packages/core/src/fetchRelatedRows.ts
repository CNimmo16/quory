import { shortestPath } from "graph-data-structure";
import { DatabaseDriver, Row } from ".";
import type { DatabaseSchema } from ".";
import makeGraphForDatabase from "../util/makeGraphForDatabase";
import findTableFromSchemas from "./util/findTableFromSchemas";

export type WhereCondition =
  | string
  | {
      operator: "=" | "<" | ">" | "<=" | ">=" | "like";
      value: string;
    }
  | {
      operator: "or" | "and";
      conditions: WhereCondition[];
    };

export default async function fetchRelatedRows(
  databaseDriver: DatabaseDriver,
  databaseSchemas: DatabaseSchema[],
  args: {
    localTableRef: string;
    foreignTableRef: string;
    via?: string[];
    where: {
      [tableRef: string]: {
        [column: string]: WhereCondition;
      };
    };
    select: {
      [tableRef: string]: string[] | "*";
    };
  }
): Promise<{
  sql: string;
  path: string[];
  rows: {
    [tableName: string]: Row;
  }[];
}> {
  const {
    localTableRef,
    foreignTableRef,
    via = [],
    where: whereArg,
    select: selectArg,
  } = args;

  const [localSchema, localTableName] = localTableRef.split(".");
  const localTable = findTableFromSchemas(
    databaseSchemas,
    localSchema,
    localTableName
  );
  const [foreignSchema, foreignTableName] = foreignTableRef.split(".");

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

  if (new Set(via).size !== via.length) {
    throw new Error(`Duplicate table refs in "via" path: ${via.join(", ")}`);
  }
  if (via.includes(localTableRef)) {
    throw new Error(`Via path includes local table ref: ${localTableRef}`);
  }
  if (via.includes(foreignTableRef)) {
    throw new Error(`Via path includes foreign table ref: ${foreignTableRef}`);
  }

  const desiredRoute = [localTableRef, ...via, foreignTableRef];

  const path = (() => {
    try {
      return [
        localTableRef,
        ...desiredRoute.flatMap((tableRef, i, arr) => {
          if (!arr[i + 1]) {
            return [];
          }
          const { nodes } = shortestPath(graph, tableRef, arr[i + 1]);
          return nodes.slice(1);
        }),
      ];
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

  const selectCols = Object.entries(selectArg).flatMap(
    ([tableRef, columns]) => {
      const [schemaName, tableName] = tableRef.split(".");
      const table = findTableFromSchemas(
        databaseSchemas,
        schemaName,
        tableName
      );
      const getSelectForColumn = (column: (typeof table.columns)[number]) => ({
        ref: `${schemaName}.${tableName}.${column.name}`,
        alias: `${schemaName}__${tableName}__${column.name}`,
      });
      return table.columns
        .filter((column) =>
          columns === "*" ? true : columns.includes(column.name)
        )
        .map(getSelectForColumn);
    }
  );

  const where = Object.entries(whereArg)
    .flatMap(([tableRef, conditions]) => {
      const [schemaName, tableName] = tableRef.split(".");
      const table = findTableFromSchemas(
        databaseSchemas,
        schemaName,
        tableName
      );
      return Object.entries(conditions).map(function makeCondition([
        columnName,
        condition,
      ]): string {
        if (!path.includes(`${schemaName}.${tableName}`)) {
          throw new Error(
            `Where clause references table ${`${schemaName}.${tableName}`} which is not part of the path`
          );
        }
        if (!table.columns.some((column) => column.name === columnName)) {
          throw new Error(
            `Where clause references column ${schemaName}.${tableName}.${columnName} which does not exist`
          );
        }
        if (typeof condition === "string") {
          return `${schemaName}.${tableName}.${columnName} = '${condition}'`;
        } else {
          switch (condition.operator) {
            case "and":
            case "or":
              return `(${condition.conditions
                .map((subCondition): string => {
                  return makeCondition([columnName, subCondition]);
                })
                .join(` ${condition.operator.toUpperCase()} `)})`;
            default:
              return `${schemaName}.${tableName}.${columnName} ${condition.operator.toUpperCase()} '${
                condition.value
              }'`;
          }
        }
      });
    })
    .join(" AND ");

  const primaryKeyRefs = path.flatMap((tableRef) => {
    const [schemaName, tableName] = tableRef.split(".");
    const table = findTableFromSchemas(databaseSchemas, schemaName, tableName);
    return table.columns
      .filter((column) => column.includedInPrimaryKey)
      .map((column) => `${schemaName}.${tableName}.${column.name}`);
  });

  const sql = `SELECT ${selectCols
    .map(({ ref, alias }) => `${ref} AS ${alias}`)
    .join(", ")} FROM ${joins}${
    where ? ` WHERE ${where}` : " "
  } GROUP BY ${primaryKeyRefs.join(", ")};`;

  const execResult = await databaseDriver.exec(sql).catch((err) => {
    console.error(`Error while executing SQL: \n${sql}\n. Error below`);
    throw err;
  });

  return {
    sql,
    path,
    rows: execResult.map((row) => {
      return Object.fromEntries(
        Object.entries(selectArg).map(([tableRef, columnsArg]) => {
          const [schemaName, tableName] = tableRef.split(".");
          const table = findTableFromSchemas(
            databaseSchemas,
            schemaName,
            tableName
          );
          const columns =
            columnsArg === "*"
              ? table.columns.map((column) => column.name)
              : columnsArg;
          return [
            tableRef,
            Object.fromEntries(
              columns.map((column) => {
                return [column, row[`${schemaName}__${tableName}__${column}`]];
              })
            ),
          ];
        })
      );
    }),
  };
}

import { shortestPath } from "graph-data-structure";
import { DatabaseDriver, Row } from ".";
import type { DatabaseSchema, DatabaseTableInfo } from ".";
import makeGraphForDatabase from "../util/makeGraphForDatabase";
import findTableFromSchemas from "./util/findTableFromSchemas";
import groupByPath from "./util/groupByPath";
import getWhereClauseFromConditions from "./util/getWhereClauseFromConditions";
import splitTableRef from "./util/splitTableRef";

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

type JoinDef = {
  tableRef: string;
  via?: string[];
  select: string[] | "*";
  where?: {
    [column: string]: WhereCondition;
  };
};

export default async function fetchRelatedRows(
  databaseDriver: DatabaseDriver,
  databaseSchemas: DatabaseSchema[],
  args: {
    base: Required<Pick<JoinDef, "where">> & Omit<JoinDef, "where">;
    joins: JoinDef[];
  }
): Promise<{
  sql: string;
  meta: {
    subQueries: {
      id: string;
      path: string[];
    }[];
  };
  rows: {
    [tableName: string]: Row;
  }[];
}> {
  const { base, joins } = args;

  const { schemaName: baseSchemaName, tableName: baseTableName } =
    splitTableRef(base.tableRef);
  const baseTable = findTableFromSchemas(
    databaseSchemas,
    baseSchemaName,
    baseTableName
  );

  if (
    baseTable.columns.every(
      (column) =>
        column.foreignKeys.length === 0 &&
        column.foreignKeyReferences.length === 0
    )
  ) {
    throw new Error(`No relationships found for table ${baseTableName}`);
  }

  const graph = makeGraphForDatabase(databaseSchemas);

  const joinsWithPaths = joins
    .map((join, i, arr) => ({
      ...join,
      tableAlias: `${join.tableRef.replace(".", "__")}__${
        arr.filter(({ tableRef }) => tableRef === join.tableRef).indexOf(join) +
        1
      }`,
    }))
    .map(({ via = [], ...join }) => {
      const [joinedTableSchema, joinedTableName] = join.tableRef.split(".");
      if (new Set(via).size !== via.length) {
        throw new Error(
          `Duplicate table refs in "via" path: ${via.join(", ")}`
        );
      }
      if (via.includes(base.tableRef)) {
        throw new Error(`Via path includes base table ref: ${base.tableRef}`);
      }
      if (via[via.length - 1] === join.tableRef) {
        throw new Error(
          `Via path ends with joined table ref: ${join.tableRef}`
        );
      }

      const desiredRoute = [base.tableRef, ...via, join.tableRef];
      try {
        return {
          join,
          path: [
            base.tableRef,
            ...desiredRoute.flatMap((thisTable, i, arr) => {
              const nextTable = arr[i + 1];
              if (!nextTable) {
                return [];
              }
              const { nodes } = shortestPath(graph, thisTable, nextTable);
              return nodes.slice(1);
            }),
          ],
        };
      } catch {
        throw new Error(
          `Couldn't find a path from ${baseSchemaName}.${baseTableName} to ${joinedTableSchema}.${joinedTableName}`
        );
      }
    });

  const getSelectForColumn = (
    table: DatabaseTableInfo & {
      schemaName: string;
    },
    tableAlias: string,
    column: DatabaseTableInfo["columns"][number]
  ) => ({
    name: column.name,
    ref: `${tableAlias}.${column.name}`,
    subQueryAlias: `${tableAlias}__${column.name}`,
    outerAlias: `${table.schemaName}__${table.name}__${column.name}`,
    includeInOuter: true,
  });

  const subQueries = groupByPath(
    joinsWithPaths.map(({ join, path }) => {
      return { path, item: join };
    })
  ).map(({ path, items: joinDefsForPath }, idx) => {
    // const primaryKeyRefs = path
    //   .slice(1) // exclude base table as not being joined here
    //   .flatMap((tableRef) => {
    //     const { schemaName, tableName } = splitTableRef(tableRef);
    //     const table = findTableFromSchemas(
    //       databaseSchemas,
    //       schemaName,
    //       tableName
    //     );
    //     return table.columns
    //       .filter((column) => column.includedInPrimaryKey)
    //       .map((column) => `${schemaName}.${tableName}.${column.name}`);
    //   });
    let fromClause = "";
    const primaryKeyRefs: string[] = [];
    let baseTableJoin: {
      baseTableColumn: string;
      subQuerySelect: ReturnType<typeof getSelectForColumn>;
    } | null = null;
    for (const [index, tableRef] of path.entries()) {
      const thisIsBaseTable = index === 0;
      const { schemaName, tableName } = splitTableRef(tableRef);
      const nextTableRef = path[index + 1];
      if (!nextTableRef) {
        break;
      }
      const thisTable = findTableFromSchemas(
        databaseSchemas,
        schemaName,
        tableName
      );
      const prevCountOfThisTableInPath = path
        .slice(1, index)
        .filter((t) => t === tableRef).length;
      const thisJoinDef = joinDefsForPath.filter(
        (joinDef) => joinDef.tableRef === tableRef
      )[prevCountOfThisTableInPath];
      const thisTableAlias =
        thisJoinDef?.tableAlias ??
        `${schemaName}__${tableName}__${prevCountOfThisTableInPath + 1}`;

      const { schemaName: nextSchemaName, tableName: nextTableName } =
        splitTableRef(nextTableRef);
      const nextTable = findTableFromSchemas(
        databaseSchemas,
        nextSchemaName,
        nextTableName
      );
      const prevCountOfNextTableInPath = path
        .slice(1, index + 1)
        .filter((t) => t === nextTableRef).length;
      const nextJoinDef = joinDefsForPath.filter(
        (joinDef) => joinDef.tableRef === nextTableRef
      )[prevCountOfNextTableInPath];
      const nextTableAlias =
        nextJoinDef?.tableAlias ??
        `${nextSchemaName}__${nextTableName}__${
          prevCountOfNextTableInPath + 1
        }`;
      primaryKeyRefs.push(
        ...nextTable.columns
          .filter((column) => column.includedInPrimaryKey)
          .map((column) => `${nextTableAlias}.${column.name}`)
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
        if (thisIsBaseTable) {
          fromClause += `${nextTableRef} AS ${nextTableAlias}`;
          const nextTableColumn = nextTable.columns.find(
            (column) =>
              column.name ===
              referenceFromThisTableToNextTable.foreignColumnName
          );
          if (!nextTableColumn) {
            throw new Error(
              "Could not find next table column. This should never happen."
            );
          }
          baseTableJoin = {
            baseTableColumn: referenceFromThisTableToNextTable.columnName,
            subQuerySelect: getSelectForColumn(
              nextTable,
              nextTableAlias,
              nextTableColumn
            ),
          };
          continue;
        }
        fromClause += ` INNER JOIN ${nextSchemaName}.${nextTableName} AS ${nextTableAlias} ON ${nextTableAlias}.${referenceFromThisTableToNextTable.foreignColumnName} = ${thisTableAlias}.${referenceFromThisTableToNextTable.columnName}`;
        continue;
      }
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
        if (thisIsBaseTable) {
          fromClause += `${nextTableRef} AS ${nextTableAlias}`;
          const nextTableColumn = nextTable.columns.find(
            (column) =>
              column.name === referenceFromNextTableToThisTable.columnName
          );
          if (!nextTableColumn) {
            throw new Error(
              "Could not find next table column. This should never happen."
            );
          }
          baseTableJoin = {
            baseTableColumn:
              referenceFromNextTableToThisTable.foreignColumnName,
            subQuerySelect: getSelectForColumn(
              nextTable,
              nextTableAlias,
              nextTableColumn
            ),
          };
          continue;
        }
        fromClause += ` INNER JOIN ${nextSchemaName}.${nextTableName} AS ${nextTableAlias} ON ${nextTableAlias}.${referenceFromNextTableToThisTable.columnName} = ${thisTableAlias}.${referenceFromNextTableToThisTable.foreignColumnName}`;
        continue;
      }
      throw new Error(
        `Could not find relationship between ${tableRef} and ${path[index + 1]}`
      );
    }
    if (!baseTableJoin) {
      throw new Error(
        `Could not find base table join. This should never happen`
      );
    }
    const selectsAndConditions = joinDefsForPath.map(
      ({ tableRef, tableAlias, select, where }) => {
        const { schemaName, tableName } = splitTableRef(tableRef);
        const table = findTableFromSchemas(
          databaseSchemas,
          schemaName,
          tableName
        );
        const selects = table.columns
          .map((column) => getSelectForColumn(table, tableAlias, column))
          .filter((column) =>
            select === "*" ? true : select.includes(column.name)
          );
        const conditions = where
          ? getWhereClauseFromConditions(table, tableAlias, where)
          : [];
        return {
          selects,
          conditions,
        };
      }
    );
    const selects = selectsAndConditions.flatMap((x) => x.selects);
    const whereClause = selectsAndConditions
      .flatMap(({ conditions }) => conditions)
      .join(" AND ");
    if (
      !selects.some(
        (select) =>
          select.subQueryAlias === baseTableJoin.subQuerySelect.subQueryAlias
      )
    ) {
      selects.push({
        ...baseTableJoin.subQuerySelect,
        includeInOuter: false,
      });
    }
    return {
      id: `sq${idx + 1}`,
      path,
      fromClause,
      baseTableJoin,
      selects,
      whereClause,
      primaryKeyRefs,
      joinDefs: joinDefsForPath,
    };
  });

  const outerSelect = [
    ...baseTable.columns
      .filter((column) => {
        if (base.select === "*") return true;
        if (base.select.includes(column.name)) return true;
      })
      .map((column) => {
        const { ref, outerAlias } = getSelectForColumn(
          baseTable,
          `${baseTable.schemaName}.${baseTable.name}`,
          column
        );
        return `${ref} AS ${outerAlias}`;
      }),
    ...subQueries.flatMap(({ selects, id }) =>
      selects
        .filter(({ includeInOuter }) => includeInOuter)
        .map(
          ({ outerAlias, subQueryAlias }) =>
            `${id}.${subQueryAlias} AS ${outerAlias}`
        )
    ),
  ];

  let sql = `SELECT ${outerSelect.join(", ")} FROM ${base.tableRef}`;
  for (const subQuery of subQueries) {
    const subQuerySql = `SELECT ${subQuery.selects
      .map((select) => `${select.ref} AS ${select.subQueryAlias}`)
      .join(", ")} FROM ${subQuery.fromClause} ${
      subQuery.whereClause ? `WHERE ${subQuery.whereClause} ` : ""
    }GROUP BY ${subQuery.primaryKeyRefs.join(", ")}`;
    sql += ` INNER JOIN (${subQuerySql}) AS ${subQuery.id} ON ${base.tableRef}.${subQuery.baseTableJoin.baseTableColumn} = ${subQuery.id}.${subQuery.baseTableJoin.subQuerySelect.subQueryAlias}`;
  }
  sql += ` WHERE ${getWhereClauseFromConditions(baseTable, null, base.where)}`;
  sql += ` GROUP BY ${baseTable.columns
    .filter((col) => col.includedInPrimaryKey)
    .map((col) => `${baseTable.schemaName}.${baseTable.name}.${col.name}`)
    .join(", ")}`;

  const execResult = await databaseDriver.exec(sql).catch((err) => {
    console.error(`Error while executing SQL: \n${sql}\n. Error below`);
    throw err;
  });

  return {
    meta: {
      subQueries: subQueries.map(({ id, path }) => ({
        id,
        path,
      })),
    },
    sql,
    rows: execResult.map((row) => {
      return Object.fromEntries(
        [base, ...joins].map((joinDef) => {
          const { schemaName, tableName } = splitTableRef(joinDef.tableRef);
          const table = findTableFromSchemas(
            databaseSchemas,
            schemaName,
            tableName
          );
          const columns = table.columns
            .filter((column) =>
              joinDef.select === "*"
                ? true
                : joinDef.select.includes(column.name)
            )
            .map((column) => ({
              name: column.name,
              alias: getSelectForColumn(table, "THIS_CAN_BE_ANYTHING", column)
                .outerAlias,
            }));
          return [
            `${schemaName}.${tableName}`,
            Object.fromEntries(
              columns.map((column) => {
                return [column.name, row[column.alias]!];
              })
            ),
          ];
        })
      );
    }),
  };
}

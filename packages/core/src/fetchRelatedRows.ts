import { shortestPath } from "graph-data-structure";
import { DatabaseDriver, Row } from ".";
import type { DatabaseSchema } from ".";
import makeGraphForDatabase from "../util/makeGraphForDatabase";
import findTableFromSchemas from "./util/findTableFromSchemas";
import dedupeJoinPaths from "./util/dedupeJoinPaths";
import getWhereClauseFromConditions from "./util/getWhereClauseFromConditions";

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
      tableRefs: string[];
    }[];
  };
  rows: {
    [tableName: string]: Row;
  }[];
}> {
  const { base, joins } = args;

  const [baseSchemaName, baseTableName] = base.tableRef.split(".");
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

  if (joins.some((join) => join.tableRef === base.tableRef)) {
    throw new Error(
      `Table ${base.tableRef} was specified as base table and also in joins. Can't join a table to itself.`
    );
  }

  const joinPaths = joins.map(({ tableRef: joinedTableRef, via = [] }) => {
    const [joinedTableSchema, joinedTableName] = joinedTableRef.split(".");
    if (new Set(via).size !== via.length) {
      throw new Error(`Duplicate table refs in "via" path: ${via.join(", ")}`);
    }
    if (via.includes(base.tableRef)) {
      throw new Error(`Via path includes base table ref: ${base.tableRef}`);
    }
    if (via.includes(joinedTableRef)) {
      throw new Error(`Via path includes joined table ref: ${joinedTableRef}`);
    }

    const desiredRoute = [base.tableRef, ...via, joinedTableRef];
    try {
      return {
        tableRef: joinedTableRef,
        path: [
          base.tableRef,
          ...desiredRoute.flatMap((tableRef, i, arr) => {
            if (!arr[i + 1]) {
              return [];
            }
            const { nodes } = shortestPath(graph, tableRef, arr[i + 1]);
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

  const dedupedJoinPaths = dedupeJoinPaths(joinPaths).map((x, idx) => {
    return {
      ...x,
      id: `sq${idx + 1}`,
    };
  });

  const getSelectForColumn = (
    table: typeof baseTable,
    column: (typeof table.columns)[number]
  ) => ({
    name: column.name,
    ref: `${table.schemaName}.${table.name}.${column.name}`,
    alias: `${table.schemaName}__${table.name}__${column.name}`,
    includeInOuter: true,
  });

  const subQueries = dedupedJoinPaths.map(({ path, tableRefs, id }) => {
    const primaryKeyRefs = path
      .slice(1) // exclude base table as not being joined here
      .flatMap((tableRef) => {
        const [schemaName, tableName] = tableRef.split(".");
        const table = findTableFromSchemas(
          databaseSchemas,
          schemaName,
          tableName
        );
        return table.columns
          .filter((column) => column.includedInPrimaryKey)
          .map((column) => `${schemaName}.${tableName}.${column.name}`);
      });
    let fromClause = "";
    let baseTableJoin: {
      baseTableColumn: string;
      subQuerySelect: ReturnType<typeof getSelectForColumn>;
    } | null = null;
    for (const [index, tableRef] of path.entries()) {
      const thisIsBaseTable = index === 0;
      const [schemaName, tableName] = tableRef.split(".");
      const nextTableRef = path[index + 1];
      if (!nextTableRef) {
        break;
      }
      const [nextSchemaName, nextTableName] = nextTableRef.split(".");
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
        if (thisIsBaseTable) {
          fromClause += nextTableRef;
          const baseTableColumn = thisTable.columns.find(
            (column) =>
              column.name === referenceFromThisTableToNextTable.columnName
          );
          if (!baseTableColumn) {
            throw new Error(
              "Could not find base table column. This should never happen."
            );
          }
          baseTableJoin = {
            baseTableColumn: referenceFromThisTableToNextTable.columnName,
            subQuerySelect: getSelectForColumn(thisTable, baseTableColumn),
          };
          continue;
        }
        fromClause += ` INNER JOIN ${nextSchemaName}.${nextTableName} ON ${nextSchemaName}.${nextTableName}.${referenceFromThisTableToNextTable.foreignColumnName} = ${schemaName}.${tableName}.${referenceFromThisTableToNextTable.columnName}`;
        continue;
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
        if (thisIsBaseTable) {
          fromClause += nextTableRef;
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
            subQuerySelect: getSelectForColumn(nextTable, nextTableColumn),
          };
          continue;
        }
        fromClause += ` INNER JOIN ${nextSchemaName}.${nextTableName} ON ${nextSchemaName}.${nextTableName}.${referenceFromNextTableToThisTable.columnName} = ${schemaName}.${tableName}.${referenceFromNextTableToThisTable.foreignColumnName}`;
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
    const selectsAndConditions = tableRefs.map((tableRef) => {
      const joinDef = joins.find((join) => join.tableRef === tableRef)!;
      const [schemaName, tableName] = tableRef.split(".");
      const table = findTableFromSchemas(
        databaseSchemas,
        schemaName,
        tableName
      );
      const selects = table.columns
        .map((column) => getSelectForColumn(table, column))
        .filter((column) =>
          joinDef.select === "*" ? true : joinDef.select.includes(column.name)
        );
      const conditions = joinDef.where
        ? getWhereClauseFromConditions(table, joinDef.where)
        : [];
      return {
        selects,
        conditions,
      };
    });
    const selects = selectsAndConditions.flatMap((x) => x.selects);
    const whereClause = selectsAndConditions
      .flatMap(({ conditions }) => conditions)
      .join(" AND ");
    if (
      !selects.some(
        (select) => select.alias === baseTableJoin.subQuerySelect.alias
      )
    ) {
      selects.push({
        ...baseTableJoin.subQuerySelect,
        includeInOuter: false,
      });
    }
    return {
      id,
      path,
      fromClause,
      baseTableJoin,
      selects,
      whereClause,
      primaryKeyRefs,
      tableRefs,
    };
  });

  const outerSelect = [
    ...baseTable.columns
      .filter((column) => {
        if (base.select === "*") return true;
        if (base.select.includes(column.name)) return true;
      })
      .map((column) => {
        const { ref, alias } = getSelectForColumn(baseTable, column);
        return `${ref} AS ${alias}`;
      }),
    ...subQueries.flatMap(({ selects }) =>
      selects
        .filter(({ includeInOuter }) => includeInOuter)
        .map(({ alias }) => alias)
    ),
  ];

  let sql = `SELECT ${outerSelect.join(", ")} FROM ${base.tableRef}`;
  for (const subQuery of subQueries) {
    const subQuerySql = `SELECT ${subQuery.selects
      .map((select) => `${select.ref} AS ${select.alias}`)
      .join(", ")} FROM ${subQuery.fromClause} ${
      subQuery.whereClause ? `WHERE ${subQuery.whereClause} ` : ""
    }GROUP BY ${subQuery.primaryKeyRefs.join(", ")}`;
    sql += ` INNER JOIN (${subQuerySql}) AS ${subQuery.id} ON ${base.tableRef}.${subQuery.baseTableJoin.baseTableColumn} = ${subQuery.id}.${subQuery.baseTableJoin.subQuerySelect.alias}`;
  }
  sql += ` WHERE ${getWhereClauseFromConditions(baseTable, base.where)}`;

  const execResult = await databaseDriver.exec(sql).catch((err) => {
    console.error(`Error while executing SQL: \n${sql}\n. Error below`);
    throw err;
  });

  return {
    meta: {
      subQueries: subQueries.map(({ id, path, tableRefs }) => ({
        id,
        path,
        tableRefs,
      })),
    },
    sql,
    rows: execResult.map((row) => {
      return Object.fromEntries(
        [base, ...joins].map((joinDef) => {
          const [schemaName, tableName] = joinDef.tableRef.split(".");
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
              alias: getSelectForColumn(table, column).alias,
            }));
          return [
            `${schemaName}.${tableName}`,
            Object.fromEntries(
              columns.map((column) => {
                return [column.name, row[column.alias]];
              })
            ),
          ];
        })
      );
    }),
  };
}

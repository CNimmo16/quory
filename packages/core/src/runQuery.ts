import { parameterPlaceholder } from "./sqlDialect";
import { DatabaseDriver, Row } from ".";
import type { DatabaseSchema } from ".";
import findTableFromSchemas from "./util/findTableFromSchemas";
import splitTableRef from "./util/splitTableRef";
import prepareQuery, {
  FlattenedPreparedJoinDef,
  PreparedQuery,
  Query,
} from "./prepareQuery";
import getSelectForColumn from "./util/getSelectForColumn";

export default async function runQuery(
  databaseDriver: DatabaseDriver,
  databaseSchemas: DatabaseSchema[],
  query: Query
): Promise<{
  sql: string;
  meta: {
    preparedQuery: PreparedQuery;
    joinsList: FlattenedPreparedJoinDef[];
  };
  rows: {
    joinAlias: string;
    tableRef: string;
    data: Row;
  }[][];
}> {
  const {
    sql: preparedSql,
    parameters,
    preparedQuery,
    joinsList,
  } = await prepareQuery(databaseSchemas, query, databaseDriver.dialect);

  let sql = preparedSql;
  if (query.limit) {
    parameters.push(query.limit);
    sql += ` LIMIT ${parameterPlaceholder(
      parameters.length,
      databaseDriver.dialect
    )}`;
  }

  const execResult = await databaseDriver.exec(sql, parameters).catch((err) => {
    console.error(`Error while executing SQL: \n${sql}\n. Error below`);
    throw err;
  });

  return {
    meta: {
      preparedQuery,
      joinsList,
    },
    sql,
    rows: execResult.map((row) => {
      return joinsList.map((join) => {
        const [schemaName, tableName] = splitTableRef(join.tableRef);
        const table = findTableFromSchemas(
          databaseSchemas,
          schemaName,
          tableName
        );
        const columns = table.columns
          .filter((column) => join.select.includes(column.name))
          .map((column) => ({
            name: column.name,
            alias: getSelectForColumn(
              table,
              join.joinAlias,
              column,
              join.resultAliases[column.name]
            ).outerAlias,
          }));
        return {
          joinAlias: join.joinAlias,
          tableRef: join.tableRef,
          data: Object.fromEntries(
            columns.map((column) => {
              return [column.name, row[column.alias]!];
            })
          ),
        };
      });
    }),
  };
}

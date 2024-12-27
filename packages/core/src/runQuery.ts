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
    preparedQuery,
    joinsList,
  } = await prepareQuery(databaseSchemas, query);

  let sql = preparedSql;
  if (query.limit) {
    sql += ` LIMIT ${query.limit}`;
  }

  const execResult = await databaseDriver.exec(sql).catch((err) => {
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
          .filter((column) =>
            join.select === "*" ? true : join.select.includes(column.name)
          )
          .map((column) => ({
            name: column.name,
            alias: getSelectForColumn(table, "THIS_CAN_BE_ANYTHING", column)
              .outerAlias,
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

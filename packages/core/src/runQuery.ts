import executeQuery from "./executeQuery";
import type { ExecutionOptions } from "./DatabaseDriver";
import { parameterPlaceholder, quoteIdentifier } from "./sqlDialect";
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
  query: Query,
  options?: ExecutionOptions
): Promise<{
  sql: string;
  meta: {
    preparedQuery: PreparedQuery;
    joinsList: FlattenedPreparedJoinDef[];
  };
  rows: {
    joinAlias: string;
    tableRef: string;
    recordKey: string | null;
    data: Row;
  }[][];
}> {
  const {
    sql: preparedSql,
    parameters,
    preparedQuery,
    joinsList,
    recordKeyAliases,
  } = await prepareQuery(databaseSchemas, query, databaseDriver.dialect, {
    includeRecordKeys: true,
  });

  let sql = preparedSql;
  // Primary keys provide deterministic page boundaries, including ties in user sorting.
  const keyOrder = joinsList.flatMap((join) => {
    const [schemaName, tableName] = splitTableRef(join.tableRef);
    return findTableFromSchemas(databaseSchemas, schemaName, tableName)
      .columns.filter((column) => column.includedInPrimaryKey)
      .map(
        (column) =>
          `${quoteIdentifier(
            join.joinAlias,
            databaseDriver.dialect
          )}.${quoteIdentifier(column.name, databaseDriver.dialect)} ASC`
      );
  });
  if (keyOrder.length)
    sql += `${
      joinsList.some((join) => join.orderBy?.length) ? ", " : " ORDER BY "
    }${keyOrder.join(", ")}`;
  parameters.push(query.limit ?? 100);
  sql += ` LIMIT ${parameterPlaceholder(
    parameters.length,
    databaseDriver.dialect
  )}`;
  parameters.push(query.offset ?? 0);
  sql += ` OFFSET ${parameterPlaceholder(
    parameters.length,
    databaseDriver.dialect
  )}`;

  const execResult = await executeQuery(
    databaseDriver,
    sql,
    parameters,
    options
  ).catch((err) => {
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
        const keys = (recordKeyAliases[join.joinAlias] ?? []).map(
          (alias) => row[alias]
        );
        return {
          joinAlias: join.joinAlias,
          tableRef: join.tableRef,
          // Tuple encoding avoids composite-key collisions and preserves types.
          // Missing or nullable keys cannot establish that two records are equal.
          recordKey:
            keys.length && keys.every((key) => key != null)
              ? JSON.stringify(keys)
              : null,
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

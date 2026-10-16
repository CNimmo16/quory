import executeQuery from "./executeQuery";
import type { ExecutionOptions } from "./DatabaseDriver";
import { DatabaseSchema, DatabaseDriver, Query } from ".";
import validateQuery from "./validateQuery";
import prepareQuery from "./prepareQuery";

export default async function getCountForQuery(
  databaseDriver: DatabaseDriver,
  databaseSchemas: DatabaseSchema[],
  query: Query,
  options?: ExecutionOptions,
) {
  validateQuery(databaseSchemas, query);
  const { sql, parameters, preparedQuery } = await prepareQuery(
    databaseSchemas,
    query,
    databaseDriver.dialect,
    { includeOrderBy: false },
  );

  const rows = await executeQuery(
    databaseDriver,
    `SELECT COUNT(*) AS count FROM (${sql}) AS quory_count`,
    parameters,
    options,
  );

  const count = Number(rows[0]!.count);

  return {
    count,
    meta: {
      preparedQuery,
    },
  };
}

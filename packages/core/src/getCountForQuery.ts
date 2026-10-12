import { DatabaseSchema, DatabaseDriver, Query } from ".";
import prepareQuery from "./prepareQuery";

export default async function getCountForQuery(
  databaseDriver: DatabaseDriver,
  databaseSchemas: DatabaseSchema[],
  query: Omit<Query, "limit">
) {
  const { sql, parameters, preparedQuery } = await prepareQuery(
    databaseSchemas,
    query,
    databaseDriver.dialect
  );

  const rows = await databaseDriver.exec(
    `SELECT COUNT(*) AS count FROM (${sql}) AS quory_count`,
    parameters
  );

  const count = Number(rows[0]!.count);

  return {
    count,
    meta: {
      preparedQuery,
    },
  };
}

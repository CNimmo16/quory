import { DatabaseSchema, DatabaseDriver, Query } from ".";
import prepareQuery from "./prepareQuery";

export default async function getCountForQuery(
  databaseDriver: DatabaseDriver,
  databaseSchemas: DatabaseSchema[],
  query: Omit<Query, "limit">
) {
  const { sql, preparedQuery } = await prepareQuery(databaseSchemas, query);

  const rows = await databaseDriver.exec(
    `SELECT COUNT(*) AS count FROM (${sql})`
  );

  const count = Number(rows[0]!.count);

  return {
    count,
    meta: {
      preparedQuery,
    },
  };
}

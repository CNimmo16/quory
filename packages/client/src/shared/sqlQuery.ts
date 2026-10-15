import type { Query, SqlDialect, SqlParameter } from "@quory/core";

export type WriteProtection =
  | "read-only"
  | "confirm-before-write"
  | "dangerously-write";
export type CustomSqlQuery = {
  mode: "sql";
  sql: string;
  parameters?: SqlParameter[] | undefined;
  dialect?: SqlDialect | undefined;
  base?: never;
  limit?: never;
  offset?: never;
};
export type RelationshipQuery = Query & {
  mode?: "relationship" | undefined;
  sql?: never;
  parameters?: never;
  dialect?: never;
};
export type QueryDefinition = RelationshipQuery | CustomSqlQuery;
export function isSqlQuery(query: QueryDefinition): query is CustomSqlQuery {
  return query.mode === "sql";
}

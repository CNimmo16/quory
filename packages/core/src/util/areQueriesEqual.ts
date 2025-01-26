import { DatabaseSchema, findTableFromSchemas, splitTableRef } from "..";
import { JoinDef, Query } from "../prepareQuery";

export default function areQueriesEqual(
  schemas: DatabaseSchema[],
  queryA: Query,
  queryB: Query
) {
  const convertSelect = (join: JoinDef) => {
    if (typeof join.select === "string") {
      const [schemaName, tableName] = splitTableRef(join.tableRef);
      const table = findTableFromSchemas(schemas, schemaName, tableName);
      return table.columns.map(({ name }) => name);
    }
    return join.select;
  };

  const areJoinsEqual = (joinA: JoinDef, joinB?: JoinDef): boolean => {
    if (!joinB) {
      return false;
    }
    return (
      joinA.tableRef === joinB.tableRef &&
      convertSelect(joinA).join(",") === convertSelect(joinB).join(",") &&
      JSON.stringify(joinA.via || []) === JSON.stringify(joinB.via || []) &&
      JSON.stringify(joinA.where || {}) === JSON.stringify(joinB.where || {}) &&
      JSON.stringify(joinA.orderBy || []) ===
        JSON.stringify(joinB.orderBy || []) &&
      (joinA.joins || []).every((subJoin, i) =>
        areJoinsEqual(subJoin, (joinB.joins || [])[i])
      )
    );
  };

  return areJoinsEqual(queryA.base, queryB.base);
}

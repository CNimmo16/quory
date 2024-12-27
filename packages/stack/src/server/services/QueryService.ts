import {
  runQuery,
  getCountForQuery,
  findTableFromSchemas,
  splitTableRef,
} from "@quory/core";
import * as DatabaseService from "./DatabaseService";
import renderDataValue from "../../util/renderDataValue";
import findJoinRecursively from "../../util/findJoinRecursively";

export async function fetchDataForQuery(
  database: DatabaseService.ClientDatabase,
  query: Parameters<typeof runQuery>[2]
) {
  const { driver, schemas, semantics } = database;

  const {
    rows,
    meta: { preparedQuery },
  } = await runQuery(driver, schemas, query);

  const visibleJoins = rows[0]
    ? rows[0]
        .filter(({ data }) => Object.keys(data).length > 0)
        .map(({ data, joinAlias, tableRef }) => {
          const rowKeys = Object.keys(data);
          const [schemaName, tableName] = splitTableRef(tableRef);
          const table = findTableFromSchemas(schemas, schemaName, tableName);
          const foreignKeyReferences = table.columns.flatMap((column) =>
            column.foreignKeyReferences.map((ref) => ({
              referencedJoinAlias: joinAlias,
              referencedTableName: table.name,
              referencedColumnName: column.name,
              referencingColumnName: ref.localColumnName,
              referencingSchemaName: ref.localSchemaName,
              referencingTableName: ref.localTableName,
            }))
          );
          const found = findJoinRecursively(preparedQuery.base, joinAlias);
          if (!found) {
            throw new Error(`Could not find join ${joinAlias}`);
          }
          return {
            join: found.join,
            foreignKeyReferences,
            table,
            columns: rowKeys.map((columnName) => {
              const column = table.columns.find(
                (col) => col.name === columnName
              )!;
              return {
                isPrimaryKey: column.includedInPrimaryKey,
                name: columnName,
                readableName:
                  semantics?.lexicon.find(
                    (x) => x.columnRef === `${tableRef}.${columnName}`
                  )?.readableName ?? columnName,
              };
            }),
          };
        })
    : [];

  return {
    originalQuery: query,
    preparedQuery,
    visibleJoins,
    rows: rows.map((row) => {
      return row
        .filter(({ data }) => Object.keys(data).length > 0)
        .map(({ data, tableRef, joinAlias }) => {
          const entries = Object.entries(data);
          return entries.map(([columnName, value]) => {
            const lexiconEntry = semantics?.lexicon.find(
              (x) => x.columnRef === `${tableRef}.${columnName}`
            );
            const [schemaName, tableName] = splitTableRef(tableRef);
            const column = findTableFromSchemas(
              schemas,
              schemaName,
              tableName
            ).columns.find((col) => col.name === columnName)!;
            return {
              joinAlias,
              isPrimary: column.includedInPrimaryKey,
              type: column.genericDataType,
              rawField: columnName,
              readableField: lexiconEntry?.readableName ?? columnName,
              rawValue: value,
              readableValue: lexiconEntry?.mapping
                ? lexiconEntry.mapping[value.toString()]
                : renderDataValue(value, column.genericDataType),
              foreignKey: column.foreignKeys[0],
            };
          });
        });
    }),
  };
}

export async function fetchCountForQuery(
  database: DatabaseService.ClientDatabase,
  query: Parameters<typeof runQuery>[2]
) {
  const { driver, schemas } = database;

  const { limit: _, ...rest } = query;

  const {
    count,
    meta: { preparedQuery },
  } = await getCountForQuery(driver, schemas, rest);
  return {
    originalQuery: query,
    preparedQuery,
    count,
  };
}

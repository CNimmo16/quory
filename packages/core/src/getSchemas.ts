import type { DatabaseSchema } from ".";
import { DatabaseDriver } from ".";
import {
  configuredRelationships,
  type SchemaOptions,
} from "./relationshipConfig";

export default async function getSchemas(
  databaseDriver: DatabaseDriver,
  options: SchemaOptions = {},
): Promise<DatabaseSchema[]> {
  const schemas: DatabaseSchema[] = [];
  const retrieveOrCreateTable = (
    schemaName: string,
    tableName: string,
  ): DatabaseSchema["tables"][number] => {
    let schemaInfo = schemas.find(({ name }) => name === schemaName);
    if (!schemaInfo) {
      schemaInfo = { name: schemaName, tables: [] };
      schemas.push(schemaInfo);
    }
    let tableInfo = schemaInfo.tables.find(({ name }) => name === tableName);
    if (!tableInfo) {
      tableInfo = { name: tableName, columns: [] };
      schemaInfo.tables.push(tableInfo);
    }
    return tableInfo;
  };

  const allColumns = await databaseDriver.getAllColumnsInDatabase();
  const allForeignKeys = configuredRelationships(
    allColumns,
    await databaseDriver.getAllForeignKeysInDatabase(),
    options,
  );

  allColumns.forEach(({ tableName, schemaName, ...column }) => {
    const tableInfo = retrieveOrCreateTable(schemaName, tableName);
    tableInfo.columns.push({
      ...column,
      foreignKeys: allForeignKeys
        .filter(
          (key) =>
            key.localSchema === schemaName &&
            key.localTable === tableName &&
            key.localColumn === column.name,
        )
        .map((key) => ({
          ...(key.constraintId !== undefined
            ? {
                constraintId: key.constraintId,
                columnPosition: key.columnPosition,
              }
            : {}),
          foreignColumnName: key.foreignColumn,
          foreignSchemaName: key.foreignSchema,
          foreignTableName: key.foreignTable,
          ...(key.source ? { source: key.source } : {}),
          hasForeignKeyConstraint: !key.source || key.source === "foreign-key",
          confidence: key.confidence ?? 1,
        })),
      foreignKeyReferences: allForeignKeys
        .filter(
          (key) =>
            key.foreignSchema === schemaName &&
            key.foreignTable === tableName &&
            key.foreignColumn === column.name,
        )
        .map((key) => ({
          ...(key.constraintId !== undefined
            ? {
                constraintId: key.constraintId,
                columnPosition: key.columnPosition,
              }
            : {}),
          localColumnName: key.localColumn,
          localSchemaName: key.localSchema,
          localTableName: key.localTable,
          ...(key.source ? { source: key.source } : {}),
          hasForeignKeyConstraint: !key.source || key.source === "foreign-key",
          confidence: key.confidence ?? 1,
        })),
    });
  });

  return schemas;
}

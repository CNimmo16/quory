import type { DatabaseSchema } from ".";
import { DatabaseDriver } from ".";

export default async function getSchemas(
  databaseDriver: DatabaseDriver
): Promise<DatabaseSchema[]> {
  let schemas: DatabaseSchema[] = [];
  const retrieveOrCreateTable = (
    schemaName: string,
    tableName: string
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
  const allForeignKeys = await databaseDriver.getAllForeignKeysInDatabase();

  allColumns.forEach(({ tableName, schemaName, ...column }) => {
    const tableInfo = retrieveOrCreateTable(schemaName, tableName);
    tableInfo.columns.push({
      ...column,
      foreignKeys: allForeignKeys
        .filter(
          (key) =>
            key.localSchema === schemaName &&
            key.localTable === tableName &&
            key.localColumn === column.name
        )
        .map((key) => ({
          foreignColumnName: key.foreignColumn,
          foreignSchemaName: key.foreignSchema,
          foreignTableName: key.foreignTable,
          hasForeignKeyConstraint: true,
          confidence: 1,
        })),
      foreignKeyReferences: allForeignKeys
        .filter(
          (key) =>
            key.foreignSchema === schemaName &&
            key.foreignTable === tableName &&
            key.foreignColumn === column.name
        )
        .map((key) => ({
          localColumnName: key.localColumn,
          localSchemaName: key.localSchema,
          localTableName: key.localTable,
          hasForeignKeyConstraint: true,
          confidence: 1,
        })),
    });
  });

  return schemas;
}

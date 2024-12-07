import { DatabaseSchema } from "..";

export default function findTableFromSchemas(
  schemas: DatabaseSchema[],
  schemaName: string,
  tableName: string
) {
  const schema = schemas.find((schema) => schema.name === schemaName);

  if (!schema) {
    throw new Error(`Could not find schema ${schemaName}`);
  }
  const table = schema.tables.find((table) => table.name === tableName);

  if (!table) {
    throw new Error(`Could not find table ${schemaName}.${tableName}`);
  }
  return table;
}

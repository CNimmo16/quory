export default function splitTableRef(tableRef: string) {
  const [schemaName, tableName] = tableRef.split(".");
  if (!schemaName || !tableName) {
    throw new Error(`Invalid tableRef: ${tableRef}`);
  }
  return [schemaName, tableName] as [string, string];
}

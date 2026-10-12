export default function splitTableRef(tableRef: string) {
  const separator = tableRef.indexOf(".");
  const schemaName = tableRef.slice(0, separator);
  const tableName = tableRef.slice(separator + 1);
  if (separator < 1 || !tableName) {
    throw new Error(`Invalid tableRef: ${tableRef}`);
  }
  return [schemaName, tableName] as [string, string];
}

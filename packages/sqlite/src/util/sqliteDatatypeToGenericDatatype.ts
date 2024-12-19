import { GenericDataType } from "@quory/core";

export default function sqliteDatatypeToGenericDatatype(
  sqliteDataType: string
): GenericDataType {
  if (
    sqliteDataType.startsWith("varchar") ||
    sqliteDataType.startsWith("char")
  ) {
    return "text";
  }
  const lookup: { [x: string]: GenericDataType } = {
    INTEGER: "number",
    tinyint: "number",
    boolean: "boolean",
    TEXT: "text",
    bigint: "number",
    datetime: "datetime",
  };
  if (!lookup[sqliteDataType]) {
    throw new Error(`Datatype ${sqliteDataType} not recognised`);
  }
  return lookup[sqliteDataType];
}

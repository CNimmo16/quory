import { GenericDataType } from "@quory/core";

export default function sqliteAffinityToGenericDatatype(
  sqliteDataType: string
): GenericDataType {
  const lookup: { [x: string]: GenericDataType } = {
    TEXT: "text",
    NUMERIC: "number",
    INTEGER: "number",
    REAL: "number",
    BLOB: "binary",
  };
  if (!lookup[sqliteDataType]) {
    throw new Error(`Datatype ${sqliteDataType} not recognised`);
  }
  return lookup[sqliteDataType];
}

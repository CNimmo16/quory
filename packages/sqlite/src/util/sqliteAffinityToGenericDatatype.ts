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
  const ret = lookup[sqliteDataType];
  if (!ret) {
    throw new Error(`Datatype ${sqliteDataType} not recognised`);
  }
  return ret;
}

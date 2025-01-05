import { GenericDataType } from "@quory/core";

export default function mysqlDatatypeToGenericDatatype(
  mysqlDatatype: string
): GenericDataType {
  const lookup: { [x: string]: GenericDataType } = {
    tinytext: "text",
    text: "text",
    mediumtext: "text",
    longtext: "text",
    varchar: "text",
    tinyint: "boolean",
    smallint: "number",
    int: "number",
    bigint: "number",
    double: "number",
    float: "number",
    char: "text",
    enum: "text",
    date: "datetime",
    datetime: "datetime",
    timestamp: "datetime",
    time: "datetime",
    set: "text",
    json: "hierarchical",
    blob: "binary",
    mediumblob: "binary",
    longblob: "binary",
    decimal: "number",
  };
  const ret = lookup[mysqlDatatype];
  if (!ret) {
    throw new Error(`Datatype ${mysqlDatatype} not recognised`);
  }
  return ret;
}

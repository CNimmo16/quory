import { GenericDataType } from "@quory/core";

export default function postgresDatatypeToGenericDatatype(
  postgresDatatype: string
): GenericDataType {
  const lookup: { [x: string]: GenericDataType } = {
    bigint: "number",
    bigserial: "number",
    bit: "binary",
    "bit varying": "binary",
    boolean: "boolean",
    box: "geometric",
    bytea: "binary",
    character: "text",
    "character varying": "text",
    cidr: "other",
    circle: "geometric",
    date: "datetime",
    "double precision": "number",
    inet: "other",
    integer: "number",
    interval: "datetime",
    json: "hierarchical",
    jsonb: "hierarchical",
    line: "geometric",
    lseg: "geometric",
    macaddr: "other",
    macaddr8: "other",
    money: "money",
    numeric: "number",
    path: "geometric",
    pg_lsn: "other",
    pg_snapshot: "other",
    point: "geometric",
    polygon: "geometric",
    real: "number",
    smallint: "number",
    smallserial: "number",
    serial: "number",
    text: "text",
    "time without time zone": "datetime",
    "time with time zone": "datetime",
    "timestamp without time zone": "datetime",
    "timestamp with time zone": "datetime",
    tsquery: "other",
    tsvector: "other",
    txid_snapshot: "other",
    uuid: "text",
    xml: "hierarchical",
    "USER-DEFINED": "other",
    ARRAY: "other",
  };
  const ret = lookup[postgresDatatype];
  if (!ret) {
    throw new Error(`Datatype ${postgresDatatype} not recognised`);
  }
  return ret;
}

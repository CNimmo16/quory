export type Row = Record<string, string | number | Date>;

export type GenericDataType =
  | "binary"
  | "number"
  | "boolean"
  | "text"
  | "datetime"
  | "hierarchical"
  | "geometric"
  | "money"
  | "other";

export type TableColumn = {
  name: string;
  tableName: string;
  schemaName: string;
  isNullable: boolean;
  dataType: string;
  genericDataType: GenericDataType;
  includedInPrimaryKey: boolean;
};

export type Relationship = {
  localSchema: string;
  localTable: string;
  localColumn: string;
  foreignSchema: string;
  foreignTable: string;
  foreignColumn: string;
};

export interface DatabaseDriver {
  getAllColumnsInDatabase(): Promise<TableColumn[]>;

  getAllForeignKeysInDatabase(): Promise<Relationship[]>;

  exec(sql: string): Promise<Row[]>;

  testConnection(): Promise<void>;
}

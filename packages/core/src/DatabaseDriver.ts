import type { SqlDialect, SqlParameter } from "./sqlDialect";

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

export type RelationshipConstraint = {
  constraintId: string;
  localSchema: string;
  localTable: string;
  foreignSchema: string;
  foreignTable: string;
  columnPairs: { localColumn: string; foreignColumn: string }[];
};

// Drivers return ordered pairs; rows sharing a constraintId form one constraint.
// Metadata is optional for compatibility with legacy single-column drivers.
export type Relationship = {
  constraintId?: string;
  columnPosition?: number;
  localSchema: string;
  localTable: string;
  localColumn: string;
  foreignSchema: string;
  foreignTable: string;
  foreignColumn: string;
};

export interface DatabaseDriver {
  readonly dialect: SqlDialect;
  getAllColumnsInDatabase(): Promise<TableColumn[]>;

  getAllForeignKeysInDatabase(): Promise<Relationship[]>;

  /** Bind values using the database protocol; never interpolate or escape them into SQL. */
  exec(sql: string, parameters?: SqlParameter[]): Promise<Row[]>;

  testConnection(): Promise<void>;
}

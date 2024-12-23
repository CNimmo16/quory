import type {
  DatabaseDriver,
  GenericDataType,
  Relationship,
  TableColumn,
  Row,
} from "./DatabaseDriver";
import getSchemas from "./getSchemas";
import fetchRelatedRows, { type WhereCondition } from "./fetchRelatedRows";
import getRelationsForTable from "./getRelationsForTable";
import getEntitiesAndJunctions from "./getEntitiesAndJunctions";
import findTableFromSchemas from "./util/findTableFromSchemas";

export {
  getSchemas,
  fetchRelatedRows,
  getRelationsForTable,
  getEntitiesAndJunctions,
  Relationship,
  TableColumn,
  GenericDataType,
  Row,
  DatabaseDriver,
  WhereCondition,
  findTableFromSchemas,
};

export type DatabaseTableInfo = {
  name: string;
  type?: "entity" | "junction";
  columns: {
    name: string;
    dataType: string;
    genericDataType: GenericDataType;
    isNullable: boolean;
    includedInPrimaryKey: boolean;
    foreignKeys: {
      foreignSchemaName: string;
      foreignTableName: string;
      foreignColumnName: string;
      hasForeignKeyConstraint: boolean;
      confidence: number;
    }[];
    foreignKeyReferences: {
      localSchemaName: string;
      localTableName: string;
      localColumnName: string;
      hasForeignKeyConstraint: boolean;
      confidence: number;
    }[];
  }[];
};

export type DatabaseSchema = {
  name: string;
  tables: DatabaseTableInfo[];
};

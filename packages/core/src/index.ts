import type {
  DatabaseInspectionDriver,
  GenericDataType,
  Relationship,
  TableColumn,
  Row,
} from "../src/DatabaseInspectionDriver";
import FakeDatabaseInspectionDriver from "./FakeDatabaseInspectionDriver";
import getSchemas from "./getSchemas";
import fetchRelatedRows from "./fetchRelatedRows";
import getEntitiesAndJunctions from "./getEntitiesAndJunctions";

export {
  getSchemas,
  fetchRelatedRows,
  getEntitiesAndJunctions,
  Relationship,
  TableColumn,
  GenericDataType,
  Row,
  DatabaseInspectionDriver,
  FakeDatabaseInspectionDriver,
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

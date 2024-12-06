import type {
  DatabaseInspectionDriver,
  GenericDataType,
  Relationship,
  TableColumn,
  Row,
} from "../src/DatabaseInspectionDriver";
import FakeDatabaseInspectionDriver from "./FakeDatabaseInspectionDriver";
import detectDatabaseSchemaRelationships from "./detectDatabaseSchemaRelationships";
import fetchRelatedTableRow from "./fetchRelatedTableRow";
import detectDatabaseEntities from "./detectDatabaseEntities";

export {
  detectDatabaseSchemaRelationships,
  fetchRelatedTableRow,
  detectDatabaseEntities,
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

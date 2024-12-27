import type {
  DatabaseDriver,
  GenericDataType,
  Relationship,
  TableColumn,
  Row,
} from "./DatabaseDriver";
import getSchemas from "./getSchemas";
import {
  type Condition,
  type ValueCondition,
  type ValueConditionOperator,
  valueConditionOperators,
  type BooleanCondition,
  type BooleanConditionOperator,
  booleanConditionOperators,
  type ListCondition,
  type ListConditionOperator,
  listConditionOperators,
  ConditionOperator,
  type JoinDef,
  type Query,
  type PreparedJoinDef,
  type PreparedQuery,
  isBooleanCondition,
  isValueCondition,
  isListCondition,
} from "./prepareQuery";
import runQuery from "./runQuery";
import getCountForQuery from "./getCountForQuery";
import getRelationsForTable from "./getRelationsForTable";
import getEntitiesAndJunctions from "./getEntitiesAndJunctions";
import findTableFromSchemas from "./util/findTableFromSchemas";
import splitTableRef from "./util/splitTableRef";
import isConditionComplete from "./util/isConditionComplete";
import parseToCompleteCondition from "./util/parseToCompleteCondition";

export {
  getSchemas,
  runQuery,
  getCountForQuery,
  getRelationsForTable,
  getEntitiesAndJunctions,
  Relationship,
  TableColumn,
  GenericDataType,
  Row,
  DatabaseDriver,
  ValueCondition,
  ValueConditionOperator,
  valueConditionOperators,
  isValueCondition,
  BooleanCondition,
  BooleanConditionOperator,
  booleanConditionOperators,
  isBooleanCondition,
  ListCondition,
  ListConditionOperator,
  listConditionOperators,
  isListCondition,
  Condition,
  ConditionOperator,
  isConditionComplete,
  parseToCompleteCondition,
  JoinDef,
  Query,
  PreparedJoinDef,
  PreparedQuery,
  findTableFromSchemas,
  splitTableRef,
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

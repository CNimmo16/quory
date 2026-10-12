import type {
  DatabaseDriver,
  GenericDataType,
  Relationship,
  RelationshipConstraint,
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
import prepareQuery from "./prepareQuery";
import getCountForQuery from "./getCountForQuery";
import getRelationsForTable from "./getRelationsForTable";
import getTableRelationships from "./util/getTableRelationships";
import getEntitiesAndJunctions from "./getEntitiesAndJunctions";
import findTableFromSchemas from "./util/findTableFromSchemas";
import splitTableRef from "./util/splitTableRef";
import isConditionComplete from "./util/isConditionComplete";
import parseToCompleteCondition from "./util/parseToCompleteCondition";
import areQueriesEqual from "./util/areQueriesEqual";
import normalizeVia, {
  type ViaStep,
  type ViaTableStep,
} from "./util/normalizeVia";

export {
  getSchemas,
  runQuery,
  prepareQuery,
  getCountForQuery,
  getRelationsForTable,
  getTableRelationships,
  getEntitiesAndJunctions,
  Relationship,
  RelationshipConstraint,
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
  areQueriesEqual,
  normalizeVia,
  ViaStep,
  ViaTableStep,
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
      constraintId?: string;
      columnPosition?: number;
      foreignSchemaName: string;
      foreignTableName: string;
      foreignColumnName: string;
      hasForeignKeyConstraint: boolean;
      confidence: number;
    }[];
    foreignKeyReferences: {
      constraintId?: string;
      columnPosition?: number;
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

export { default as validateQuery } from "./validateQuery";
export { quoteIdentifier, parameterPlaceholder } from "./sqlDialect";
export type { SqlDialect, SqlParameter } from "./sqlDialect";

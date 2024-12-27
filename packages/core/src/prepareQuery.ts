import type { DatabaseSchema } from ".";
import makeGraphForDatabase from "../util/makeGraphForDatabase";
import findTableFromSchemas from "./util/findTableFromSchemas";
import getWhereClauseFromConditions from "./util/getWhereClauseFromConditions";
import splitTableRef from "./util/splitTableRef";
import getSelectForColumn from "./util/getSelectForColumn";
import getShortestPath from "./util/getShortestPath";

export enum ConditionOperator {
  AND = "and",
  OR = "or",
  LIKE = "like",
  EQUALS = "=",
  GREATER_THAN = ">",
  LESS_THAN = "<",
  GREATER_THAN_OR_EQUAL = ">=",
  LESS_THAN_OR_EQUAL = "<=",
  NOT_EQUALS = "<>",
  NOT_LIKE = "not like",
  NOT_IN = "not in",
  IN = "in",
}

export type BooleanConditionOperator = Extract<
  ConditionOperator,
  ConditionOperator.AND | ConditionOperator.OR
>;

export const booleanConditionOperators: ConditionOperator[] = [
  ConditionOperator.AND,
  ConditionOperator.OR,
];

export const isBooleanCondition = (
  condition: Condition
): condition is BooleanCondition =>
  booleanConditionOperators.includes(condition.operator);

export type ValueConditionOperator = Exclude<
  ConditionOperator,
  | ConditionOperator.AND
  | ConditionOperator.OR
  | ConditionOperator.IN
  | ConditionOperator.NOT_IN
>;

export const valueConditionOperators: ConditionOperator[] = [
  ConditionOperator.EQUALS,
  ConditionOperator.GREATER_THAN,
  ConditionOperator.LESS_THAN,
  ConditionOperator.GREATER_THAN_OR_EQUAL,
  ConditionOperator.LESS_THAN_OR_EQUAL,
  ConditionOperator.NOT_EQUALS,
  ConditionOperator.LIKE,
  ConditionOperator.NOT_LIKE,
];

export const isValueCondition = (
  condition: Condition
): condition is ValueCondition =>
  valueConditionOperators.includes(condition.operator);

export type ListConditionOperator = Extract<
  ConditionOperator,
  ConditionOperator.IN | ConditionOperator.NOT_IN
>;

export const listConditionOperators: ConditionOperator[] = [
  ConditionOperator.IN,
  ConditionOperator.NOT_IN,
];

export const isListCondition = (
  condition: Condition
): condition is ListCondition =>
  listConditionOperators.includes(condition.operator);

export type BooleanCondition = {
  operator: BooleanConditionOperator;
  conditions: Condition[];
};

export type ValueCondition = {
  column: string;
  operator: ValueConditionOperator;
  value: string;
};

export type ListCondition = {
  column: string;
  operator: ListConditionOperator;
  values: string[];
};

export type Condition = BooleanCondition | ValueCondition | ListCondition;

export type JoinDef = {
  tableRef: string;
  via?: string[] | undefined;
  select: string[] | "*";
  where?: Condition | undefined;
  joins?: JoinDef[] | undefined;
  orderBy?:
    | {
        column: string;
        direction: "asc" | "desc";
        priority?: number | undefined;
      }[]
    | undefined;
};

export interface Query {
  base: JoinDef;
  limit?: number | undefined;
}

type JoinDefWithAlias = Omit<JoinDef, "joins"> & {
  joinAlias: string;
  joins: JoinDefWithAlias[];
};

type JoinDefWithPath = JoinDefWithAlias & {
  pathFromBase: string[];
};

type FlattenedJoinDef = Omit<JoinDefWithPath, "joins">;

export type PreparedJoinDef = Omit<FlattenedJoinDef, "pathFromBase"> & {
  select: string[];
  joins: PreparedJoinDef[];
};

export interface PreparedQuery extends Query {
  base: PreparedJoinDef;
}

export type FlattenedPreparedJoinDef = Omit<PreparedJoinDef, "childJoins"> & {
  parent: FlattenedPreparedJoinDef | null;
  childJoins: {
    joinAlias: string;
    tableRef: string;
  }[];
};

export default async function prepareQuery(
  databaseSchemas: DatabaseSchema[],
  query: Query
): Promise<{
  sql: string;
  preparedQuery: PreparedQuery;
  joinsList: FlattenedPreparedJoinDef[];
}> {
  const { base } = query;

  const [baseSchemaName, baseTableName] = splitTableRef(base.tableRef);
  const baseTable = findTableFromSchemas(
    databaseSchemas,
    baseSchemaName,
    baseTableName
  );

  if (
    baseTable.columns.every(
      (column) =>
        column.foreignKeys.length === 0 &&
        column.foreignKeyReferences.length === 0
    )
  ) {
    throw new Error(`No relationships found for table ${baseTableName}`);
  }

  const tableSeenCounts: {
    [key: string]: number;
  } = {};

  const getAlias = (tableRef: string) => {
    tableSeenCounts[tableRef] = tableSeenCounts[tableRef] ?? 0;
    tableSeenCounts[tableRef]! += 1;
    const [tableSchema, tableName] = splitTableRef(tableRef);
    return `${tableSchema}__${tableName}__${tableSeenCounts[tableRef]}`;
  };

  const joinDefsWithAliases = (function addAlias(
    join: JoinDef
  ): JoinDefWithAlias {
    return {
      ...join,
      joinAlias: getAlias(join.tableRef),
      joins: join.joins?.map((childJoin) => addAlias(childJoin)) ?? [],
    };
  })(base);

  const graph = makeGraphForDatabase(databaseSchemas);

  const flattenedJoinDefs = (function flattenJoinDef(
    join: JoinDefWithAlias,
    parent?: JoinDefWithPath
  ): FlattenedJoinDef[] {
    if (join.via && join.via[join.via.length - 1] === join.tableRef) {
      throw new Error(
        `Via path (${join.via.join(", ")}) for join ${
          join.tableRef
        } ends with table ref ${join.tableRef}`
      );
    }
    const pathFromBase = parent
      ? [
          ...parent.pathFromBase.slice(0, parent.pathFromBase.length - 1),
          ...getShortestPath(
            graph,
            parent.tableRef,
            join.tableRef,
            join.via ?? []
          ),
        ]
      : [join.tableRef];
    const ret: JoinDefWithPath = {
      ...join,
      pathFromBase,
    };
    const { joins: _, ...rest } = ret;
    if (join.joins) {
      for (const [index, childJoin] of join.joins.entries()) {
        const match = join.joins.some(
          ({ tableRef }, i) => index !== i && tableRef === childJoin.tableRef
        );
        if (match) {
          throw new Error(
            `Duplicate table ref ${
              childJoin.tableRef
            }. Path: ${pathFromBase.join(" > ")} > ${childJoin.tableRef}`
          );
        }
      }
      return [
        rest,
        ...(join.joins ?? []).flatMap((childJoin) =>
          flattenJoinDef(childJoin, ret)
        ),
      ];
    } else {
      return [rest];
    }
  })(joinDefsWithAliases);

  const joinTree = (function buildTree(
    join: FlattenedJoinDef
  ): PreparedJoinDef {
    const joinsInSubTreeOfThisJoin = flattenedJoinDefs
      .filter(({ joinAlias }) => joinAlias !== join.joinAlias)
      .filter((otherJoin) => {
        // return joins where path is same up to current join
        return join.pathFromBase.every(
          (tableRef, i) => otherJoin.pathFromBase[i] === tableRef
        );
      });
    const childJoins = joinsInSubTreeOfThisJoin.filter(
      ({ pathFromBase }) => pathFromBase.length === join.pathFromBase.length + 1
    );
    for (const joinInSubTree of joinsInSubTreeOfThisJoin) {
      const childNodeWithConnection = childJoins.find(({ pathFromBase }) =>
        joinInSubTree.pathFromBase.join().includes(pathFromBase.join())
      );
      if (!childNodeWithConnection) {
        const childNodeTableRef =
          joinInSubTree.pathFromBase[join.pathFromBase.length]!;
        childJoins.push({
          tableRef: childNodeTableRef,
          select: [],
          joinAlias: getAlias(childNodeTableRef),
          pathFromBase: [...join.pathFromBase, childNodeTableRef],
        });
      }
    }
    let select = join.select;
    if (select === "*") {
      const [schemaName, tableName] = splitTableRef(join.tableRef);
      const table = findTableFromSchemas(
        databaseSchemas,
        schemaName,
        tableName
      );
      select = table.columns.map(({ name }) => name);
    }
    return {
      ...join,
      select,
      joins: childJoins.map(buildTree),
    };
  })(flattenedJoinDefs[0]!);

  const select = (function extractSelects(
    join: PreparedJoinDef
  ): ReturnType<typeof getSelectForColumn>[] {
    const [schemaName, tableName] = splitTableRef(join.tableRef);
    const table = findTableFromSchemas(databaseSchemas, schemaName, tableName);
    return [
      ...table.columns
        .map((column) => getSelectForColumn(table, join.joinAlias, column))
        .filter((column) => join.select.includes(column.name)),
      ...join.joins.flatMap(extractSelects),
    ];
  })(joinTree);

  const conditions = (function extractConditions(
    join: PreparedJoinDef
  ): ReturnType<typeof getWhereClauseFromConditions>[] {
    const [schemaName, tableName] = splitTableRef(join.tableRef);
    const table = findTableFromSchemas(databaseSchemas, schemaName, tableName);
    return [
      ...(join.where
        ? [getWhereClauseFromConditions(table, join.joinAlias, join.where)]
        : []),
      ...join.joins.flatMap(extractConditions),
    ];
  })(joinTree);

  const orderBy = (function extractOrderBy(
    join: PreparedJoinDef,
    priorities?: number[]
  ): {
    joinAlias: string;
    column: string;
    order: "asc" | "desc";
    priority: number;
  }[] {
    return [
      ...(join.orderBy
        ? join.orderBy.map(({ column, direction, priority }) => {
            if (priorities && priorities.length >= 1 && !priority) {
              throw new Error(
                "Missing 'priority' field for orderBy. 'priority' must be specified when multiple orderBy conditions exist in the query."
              );
            }
            if (priority && priorities && priorities.includes(priority)) {
              throw new Error(
                `Duplicate 'priority' field for orderBy: ${priority}`
              );
            }
            return {
              joinAlias: join.joinAlias,
              column,
              order: direction,
              priority: priority || 0,
            };
          })
        : []),
      ...join.joins.flatMap((childJoin) =>
        extractOrderBy(childJoin, priorities)
      ),
    ];
  })(joinTree);

  let fromClause = `${joinTree.tableRef} AS ${joinTree.joinAlias}`;
  const primaryKeyRefs: string[] = [];
  function traverseTree(thisJoin: PreparedJoinDef) {
    const [schemaName, tableName] = splitTableRef(thisJoin.tableRef);
    const thisTable = findTableFromSchemas(
      databaseSchemas,
      schemaName,
      tableName
    );
    primaryKeyRefs.push(
      ...thisTable.columns
        .filter((column) => column.includedInPrimaryKey)
        .map((column) => `${thisJoin.joinAlias}.${column.name}`)
    );

    for (const childJoin of thisJoin.joins) {
      const [childSchemaName, childTableName] = splitTableRef(
        childJoin.tableRef
      );
      const childTable = findTableFromSchemas(
        databaseSchemas,
        childSchemaName,
        childTableName
      );
      const referenceFromThisTableToChildTable = thisTable.columns
        .flatMap((column) =>
          column.foreignKeys.map((ref) => ({
            ...ref,
            columnName: column.name,
          }))
        )
        .find(
          (reference) =>
            reference.foreignSchemaName === childSchemaName &&
            reference.foreignTableName === childTableName
        );
      if (referenceFromThisTableToChildTable) {
        fromClause += ` INNER JOIN ${childSchemaName}.${childTableName} AS ${childJoin.joinAlias} ON ${childJoin.joinAlias}.${referenceFromThisTableToChildTable.foreignColumnName} = ${thisJoin.joinAlias}.${referenceFromThisTableToChildTable.columnName}`;
      } else {
        const referenceFromChildTableToThisTable = childTable.columns
          .flatMap((column) =>
            column.foreignKeys.map((ref) => ({
              ...ref,
              columnName: column.name,
            }))
          )
          .find(
            (reference) =>
              reference.foreignSchemaName === schemaName &&
              reference.foreignTableName === tableName
          );
        if (!referenceFromChildTableToThisTable) {
          throw new Error(
            `Could not find reference from ${childSchemaName}.${childTableName} to ${schemaName}.${tableName}. This should never happen.`
          );
        }
        fromClause += ` INNER JOIN ${childSchemaName}.${childTableName} AS ${childJoin.joinAlias} ON ${childJoin.joinAlias}.${referenceFromChildTableToThisTable.columnName} = ${thisJoin.joinAlias}.${referenceFromChildTableToThisTable.foreignColumnName}`;
      }
      traverseTree(childJoin);
    }
  }
  traverseTree(joinTree);

  const sql = `SELECT ${select.map(
    (column) => `${column.ref} AS ${column.outerAlias}`
  )} FROM ${fromClause} ${
    conditions.length >= 1 ? `WHERE ${conditions.join(" AND ")}` : ""
  } ${
    primaryKeyRefs.length >= 1 ? `GROUP BY ${primaryKeyRefs.join(", ")}` : ""
  } ${
    orderBy.length >= 1
      ? `ORDER BY ${orderBy.map(
          (column) =>
            `${column.joinAlias}.${column.column} ${
              column.order === "asc" ? "ASC" : "DESC"
            }`
        )}`
      : ""
  }`;

  const joinsList = (function flattenJoinTree(
    join: PreparedJoinDef,
    parent: FlattenedPreparedJoinDef | null = null
  ): FlattenedPreparedJoinDef[] {
    const joinWithParent = {
      ...join,
      parent,
      childJoins: join.joins.map((child) => ({
        tableRef: child.tableRef,
        joinAlias: child.joinAlias,
      })),
    };
    return [
      joinWithParent,
      ...join.joins.flatMap((child) => flattenJoinTree(child, joinWithParent)),
    ];
  })(joinTree);

  const preparedQuery = {
    ...query,
    base: joinTree,
  };

  return {
    preparedQuery,
    joinsList,
    sql,
  };
}

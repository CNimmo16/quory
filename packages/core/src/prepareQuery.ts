import validateQuery from "./validateQuery";
import {
  quoteIdentifier,
  type SqlDialect,
  type SqlParameter,
} from "./sqlDialect";
import type { DatabaseSchema } from ".";
import makeGraphForDatabase from "../util/makeGraphForDatabase";
import findTableFromSchemas from "./util/findTableFromSchemas";
import getWhereClauseFromConditions from "./util/getWhereClauseFromConditions";
import splitTableRef from "./util/splitTableRef";
import getSelectForColumn from "./util/getSelectForColumn";
import getShortestPath from "./util/getShortestPath";
import normalizeVia, {
  type ViaStep,
  type ViaTableStep,
} from "./util/normalizeVia";
import resolveRelationship, {
  type ResolvedRelationship,
} from "./util/resolveRelationship";

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
  via?: ViaStep[] | undefined;
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
  offset?: number | undefined;
}

type JoinDefWithAlias = Omit<JoinDef, "joins"> & {
  joinAlias: string;
  joins: JoinDefWithAlias[];
};

export type PreparedJoinDef = Omit<JoinDefWithAlias, "select" | "joins"> & {
  select: string[];
  /** Maps selected column names to unique SQL result aliases. */
  resultAliases: Record<string, string>;
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

/** Compile validated SQL and ordered bindings. Pass both to a driver of the same dialect. */
export default async function prepareQuery(
  databaseSchemas: DatabaseSchema[],
  query: Query,
  dialect: SqlDialect = "sqlite",
  options: { includeOrderBy?: boolean; includeRecordKeys?: boolean } = {}
): Promise<{
  sql: string;
  parameters: SqlParameter[];
  preparedQuery: PreparedQuery;
  joinsList: FlattenedPreparedJoinDef[];
  recordKeyAliases: Record<string, string[]>;
}> {
  validateQuery(databaseSchemas, query);
  const parameters: SqlParameter[] = [];
  const q = (name: string) => quoteIdentifier(name, dialect);
  const tableRefSql = (ref: string) => splitTableRef(ref).map(q).join(".");
  const { base } = query;

  const [baseSchemaName, baseTableName] = splitTableRef(base.tableRef);
  findTableFromSchemas(databaseSchemas, baseSchemaName, baseTableName);

  // Short opaque aliases stay unique even after database identifier-length
  // limits, regardless of table name length, punctuation, or shared prefixes.
  let joinAliasCount = 0;
  const getAlias = (_tableRef: string) => `quory__join__${++joinAliasCount}`;

  const joinDefsWithAliases = (function addAlias(
    join: JoinDef
  ): JoinDefWithAlias {
    return {
      ...join,
      via: normalizeVia(join.via),
      joinAlias: getAlias(join.tableRef),
      joins: join.joins?.map((childJoin) => addAlias(childJoin)) ?? [],
    };
  })(base);

  const graph = makeGraphForDatabase(databaseSchemas);

  if (joinDefsWithAliases.via?.length)
    throw new Error("The base table cannot specify a via route.");
  const incomingRelationships = new WeakMap<
    PreparedJoinDef,
    ResolvedRelationship
  >();
  function planPath(sourceRef: string, child: JoinDefWithAlias) {
    const steps = normalizeVia(child.via);
    const refs = steps.map((step) => step.tableRef);
    if (new Set(refs).size !== refs.length)
      throw new Error(`Duplicate table refs in via path: ${refs.join(", ")}`);
    if (refs.includes(sourceRef))
      throw new Error(`Via path includes source table ref: ${sourceRef}`);
    if (
      refs.includes(child.tableRef) &&
      refs[refs.length - 1] !== child.tableRef
    ) {
      throw new Error(
        `Destination ${child.tableRef} must be the final via step.`
      );
    }
    if (refs[refs.length - 1] !== child.tableRef)
      steps.push({ tableRef: child.tableRef });
    const edges: { tableRef: string; incoming: ResolvedRelationship }[] = [];
    let previousRef = sourceRef;
    for (const step of steps) {
      const hasSelector =
        step.fromColumnName !== undefined ||
        step.toColumnName !== undefined ||
        step.usingConstraintId !== undefined;
      // A selector describes the edge from the preceding waypoint, so it must
      // be adjacent; do not silently apply it to a different inferred table.
      const route = hasSelector
        ? [previousRef, step.tableRef]
        : getShortestPath(graph, previousRef, step.tableRef, []);
      if (route.length < 2)
        throw new Error(`Join path must contain an edge: ${step.tableRef}`);
      for (let i = 1; i < route.length; i++) {
        const tableRef = route[i]!;
        const selector: ViaTableStep =
          i === route.length - 1 ? step : { tableRef };
        edges.push({
          tableRef,
          incoming: resolveRelationship(
            databaseSchemas,
            route[i - 1]!,
            selector
          ),
        });
      }
      previousRef = step.tableRef;
    }
    return edges;
  }

  // Build each requested branch under its actual parent instance. Shared table
  // names elsewhere in the tree must never identify a join instance.
  let resultAliasCount = 0;
  function buildTree(
    join: JoinDefWithAlias,
    incoming?: ResolvedRelationship
  ): PreparedJoinDef {
    const [schemaName, tableName] = splitTableRef(join.tableRef);
    const table = findTableFromSchemas(databaseSchemas, schemaName, tableName);
    const result: PreparedJoinDef = {
      ...join,
      via: incoming ? [incoming.step] : [],
      select:
        join.select === "*"
          ? table.columns.map(({ name }) => name)
          : join.select,
      resultAliases: Object.create(null) as Record<string, string>,
      joins: [],
    };
    for (const column of table.columns.filter((candidateColumn) =>
      result.select.includes(candidateColumn.name)
    )) {
      result.resultAliases[
        column.name
      ] = `quory__result__${++resultAliasCount}`;
    }
    if (incoming) incomingRelationships.set(result, incoming);
    const paths = join.joins.map((child) => ({
      child,
      path: planPath(join.tableRef, child),
    }));
    // Direct, explicitly requested children are reusable intermediate nodes.
    for (const { child, path } of paths.filter(
      ({ path: route }) => route.length === 1
    )) {
      result.joins.push(buildTree(child, path[0]!.incoming));
    }
    for (const { child, path } of paths.filter(
      ({ path: route }) => route.length !== 1
    )) {
      if (path.length < 1)
        throw new Error(`Join path must contain an edge: ${child.tableRef}`);
      let parent = result;
      for (const { tableRef, incoming: edgeRelationship } of path.slice(
        0,
        -1
      )) {
        const matches = parent.joins.filter(
          (candidate) =>
            candidate.tableRef === tableRef &&
            incomingRelationships.get(candidate)?.identity ===
              edgeRelationship.identity
        );
        if (matches.length > 1) {
          throw new Error(
            `Ambiguous intermediate join instance for ${tableRef}`
          );
        }
        let intermediate = matches[0];
        if (!intermediate) {
          intermediate = {
            tableRef,
            via: [edgeRelationship.step],
            select: [],
            resultAliases: Object.create(null) as Record<string, string>,
            joinAlias: getAlias(tableRef),
            joins: [],
          };
          incomingRelationships.set(intermediate, edgeRelationship);
          parent.joins.push(intermediate);
        }
        parent = intermediate;
      }
      parent.joins.push(buildTree(child, path[path.length - 1]!.incoming));
    }
    return result;
  }
  const joinTree = buildTree(joinDefsWithAliases);
  const recordKeyAliases: Record<string, string[]> = {};

  const select = (function extractSelects(
    join: PreparedJoinDef
  ): ReturnType<typeof getSelectForColumn>[] {
    const [schemaName, tableName] = splitTableRef(join.tableRef);
    const table = findTableFromSchemas(databaseSchemas, schemaName, tableName);
    // Identity is execution metadata, independent of the displayed columns.
    // Reuse visible keys and fetch omitted keys without changing the saved query.
    const hiddenKeys =
      options.includeRecordKeys && join.select.length
        ? table.columns
            .filter(
              (column) =>
                column.includedInPrimaryKey &&
                !join.select.includes(column.name)
            )
            .map((column) =>
              getSelectForColumn(
                table,
                join.joinAlias,
                column,
                `quory__result__${++resultAliasCount}`,
                dialect
              )
            )
        : [];
    if (options.includeRecordKeys && join.select.length) {
      recordKeyAliases[join.joinAlias] = table.columns
        .filter((column) => column.includedInPrimaryKey)
        .map(
          (column) =>
            join.resultAliases[column.name] ??
            hiddenKeys.find((key) => key.name === column.name)!.outerAlias
        );
    }
    return [
      ...table.columns
        .map((column) =>
          getSelectForColumn(
            table,
            join.joinAlias,
            column,
            join.resultAliases[column.name],
            dialect
          )
        )
        .filter((column) => join.select.includes(column.name)),
      ...hiddenKeys,
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
        ? [
            getWhereClauseFromConditions(
              table,
              join.joinAlias,
              join.where,
              dialect,
              parameters
            ),
          ]
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

  let fromClause = `${tableRefSql(joinTree.tableRef)} AS ${q(
    joinTree.joinAlias
  )}`;
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
        .map((column) => `${q(thisJoin.joinAlias)}.${q(column.name)}`)
    );

    for (const childJoin of thisJoin.joins) {
      const [childSchemaName, childTableName] = splitTableRef(
        childJoin.tableRef
      );
      const { relationship, forward } = incomingRelationships.get(childJoin)!;
      const localAlias = forward ? thisJoin.joinAlias : childJoin.joinAlias;
      const foreignAlias = forward ? childJoin.joinAlias : thisJoin.joinAlias;
      const predicates = relationship.columnPairs.map(
        ({ localColumn, foreignColumn }) =>
          localAlias === thisJoin.joinAlias
            ? `${q(foreignAlias)}.${q(foreignColumn)} = ${q(localAlias)}.${q(
                localColumn
              )}`
            : `${q(localAlias)}.${q(localColumn)} = ${q(foreignAlias)}.${q(
                foreignColumn
              )}`
      );
      fromClause += ` INNER JOIN ${q(childSchemaName)}.${q(
        childTableName
      )} AS ${q(childJoin.joinAlias)} ON ${predicates.join(" AND ")}`;
      traverseTree(childJoin);
    }
  }
  traverseTree(joinTree);

  const sql = `SELECT ${select.map(
    (column) => `${column.ref} AS ${q(column.outerAlias)}`
  )} FROM ${fromClause} ${
    conditions.length >= 1 ? `WHERE ${conditions.join(" AND ")}` : ""
  } ${
    primaryKeyRefs.length >= 1 ? `GROUP BY ${primaryKeyRefs.join(", ")}` : ""
  } ${
    orderBy.length >= 1 && options.includeOrderBy !== false
      ? `ORDER BY ${orderBy.map(
          (column) =>
            `${q(column.joinAlias)}.${q(column.column)} ${
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
    limit: query.limit ?? 100,
    offset: query.offset ?? 0,
    base: joinTree,
  };

  return {
    preparedQuery,
    joinsList,
    sql,
    parameters,
    recordKeyAliases,
  };
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { RouterRequest } from "../../server/routes";
import useQuory from "../useQuory";
import {
  Condition,
  BooleanCondition,
  ConditionOperator,
  findTableFromSchemas,
  isBooleanCondition,
  isValueCondition,
  ValueCondition,
  PreparedJoinDef,
  PreparedQuery,
  splitTableRef,
} from "@quory/core";
import useFetchSchema from "./useFetchSchema";
import { enableMapSet, produce, WritableDraft } from "immer";
import findJoinRecursively from "../../util/findJoinRecursively";

enableMapSet();

export default function useQuery(
  query: RouterRequest<"query">["query"] | null,
  setQuery: (query: RouterRequest<"query">["query"]) => void,
  isolatedCache = false,
  queryOptions?: Parameters<typeof useQuory<"query">>[2]
) {
  const { data: schemaData } = useFetchSchema();

  const { data, isFetching, error } = useQuory(
    "query",
    query
      ? {
          query,
        }
      : null,
    queryOptions,
    {
      isolatedCache,
    }
  );

  const [hiddenColumnRefs, setHiddenColumnRefs] = useState<Set<string>>(
    new Set()
  );

  const goToAdjacentJoin = useCallback(
    (
      draft: WritableDraft<PreparedQuery>,
      sourceJoinAlias: string,
      targetTableRef: string,
      targetFilter?: {
        column: string;
        value: string;
      }
    ) => {
      if (!data) {
        throw new Error("No data");
      }
      if (!schemaData) {
        throw new Error("No schemaData");
      }
      const source = findJoinRecursively(draft.base, sourceJoinAlias);
      if (!source) {
        throw new Error(`Couldn't find join for alias ${sourceJoinAlias}`);
      }
      const { join: sourceJoin, parent: sourceJoinParent } = source;
      const [targetTableSchema, targetTableName] =
        splitTableRef(targetTableRef);
      const targetTable = findTableFromSchemas(
        schemaData.schemas,
        targetTableSchema,
        targetTableName
      );
      const where = targetFilter
        ? ({
            operator: ConditionOperator.EQUALS,
            column: targetFilter.column,
            value: targetFilter.value,
          } as const)
        : undefined;
      if (sourceJoinParent?.tableRef === targetTableRef) {
        sourceJoinParent.select = targetTable.columns.map(({ name }) => name);
        sourceJoinParent.where = where;
      } else {
        const matchingChildJoin = sourceJoin.joins.find(
          (join) => join.tableRef === targetTableRef
        );
        if (matchingChildJoin) {
          matchingChildJoin.select = targetTable.columns.map(
            ({ name }) => name
          );
          matchingChildJoin.where = where;
        } else {
          sourceJoin.joins.push({
            select: targetTable.columns.map(({ name }) => name),
            tableRef: targetTableRef,
            where,
            joins: [],
            joinAlias: "TEMP",
          });
        }
      }
    },
    [data, schemaData]
  );

  const joinActions = useCallback(
    (joinAlias: string) => {
      if (!data) {
        throw new Error("No data");
      }
      if (!schemaData) {
        throw new Error("No schema data");
      }
      const found = findJoinRecursively(data.preparedQuery.base, joinAlias);
      if (!found) {
        throw new Error("No join found");
      }
      const [schemaName, tableName] = splitTableRef(found.join.tableRef);
      const table = findTableFromSchemas(
        schemaData.schemas,
        schemaName,
        tableName
      );
      return {
        join: found.join,
        getChildren() {
          return this.join.joins;
        },
        getParent() {
          return found.parent;
        },
        getVisibleColumns() {
          return table.columns
            .filter(
              ({ name }) =>
                this.join.select.includes(name) &&
                !hiddenColumnRefs.has(`${this.join.tableRef}.${name}`)
            )
            .map(({ name }) => name);
        },
        setSelectedColumns(columnsToSelect: string[]) {
          setQuery(
            produce(data.preparedQuery, (draft) => {
              const join = findJoinRecursively(draft.base, joinAlias)!.join;
              join.select = table.columns
                .filter((column) => {
                  return (
                    columnsToSelect.includes(column.name) ||
                    column.includedInPrimaryKey
                  );
                })
                .map(({ name }) => name);
            })
          );
          setHiddenColumnRefs(
            produce((draft) => {
              for (const column of table.columns) {
                const colRef = `${this.join.tableRef}.${column.name}`;
                if (columnsToSelect.includes(column.name)) {
                  draft.delete(colRef);
                } else if (column.includedInPrimaryKey) {
                  draft.add(colRef);
                }
              }
            })
          );
        },
        orderBy(
          config: { column: string; direction: "asc" | "desc" }[],
          {
            clearExistingOrdersForJoin,
            clearAllExistingOrders,
          }: {
            clearExistingOrdersForJoin?: boolean;
            clearAllExistingOrders?: boolean;
          } = {}
        ) {
          setQuery(
            produce(data.preparedQuery, (draft) => {
              let priority = 0;
              const join = findJoinRecursively(draft.base, joinAlias)!.join;
              if (clearAllExistingOrders) {
                (function traverseTree(thisJoin: PreparedJoinDef) {
                  thisJoin.orderBy = undefined;
                  thisJoin.joins.forEach(traverseTree);
                })(draft.base);
              }
              if (clearExistingOrdersForJoin) {
                join.orderBy = [];
              }
              let existingOrderPriorities: number[] = [];
              (function traverseTree(thisJoin: PreparedJoinDef) {
                if (thisJoin.orderBy) {
                  existingOrderPriorities = [
                    ...existingOrderPriorities,
                    ...thisJoin.orderBy.map((order) => order.priority ?? 0),
                  ];
                }
                thisJoin.joins.forEach(traverseTree);
              })(draft.base);
              // set new priority to the highest existing priority + 1
              priority =
                existingOrderPriorities.length >= 1
                  ? Math.max(...existingOrderPriorities) + 1
                  : 0;
              join.orderBy = [
                ...(join.orderBy ?? []),
                ...config.map(({ column, direction }) => ({
                  column,
                  direction,
                  priority,
                })),
              ];
            })
          );
        },
        setCondition(condition: BooleanCondition) {
          setQuery(
            produce(data.preparedQuery, (draft) => {
              const join = findJoinRecursively(draft.base, joinAlias)!.join;
              if (condition.conditions.length === 0) {
                delete join.where;
              } else {
                join.where = condition;
              }
            })
          );
        },
        removeCondition() {
          setQuery(
            produce(data.preparedQuery, (draft) => {
              const join = findJoinRecursively(draft.base, joinAlias)!.join;
              delete join.where;
            })
          );
        },
        removeJoin() {
          setQuery(
            produce(data.preparedQuery, (draft) => {
              const removeJoin = (
                join: WritableDraft<PreparedJoinDef>,
                joinAliasToRemove: string,
                parent?: WritableDraft<PreparedJoinDef>
              ) => {
                if (join.joinAlias === joinAliasToRemove) {
                  if (!parent) {
                    throw new Error("Cannot remove base join");
                  }
                  parent.joins = [
                    ...parent.joins.filter((j) => j.tableRef !== join.tableRef),
                    ...join.joins,
                  ];
                  if (parent.select.length === 0) {
                    // remove ghost joins between source and removed target
                    removeJoin(draft.base, parent.joinAlias, parent);
                  }
                } else {
                  join.joins.forEach((j) =>
                    removeJoin(j, joinAliasToRemove, join)
                  );
                }
              };
              removeJoin(draft.base, this.join.joinAlias);
            })
          );
        },
        addJoin(targetTableRef: string) {
          setQuery(
            produce(data.preparedQuery, (draft) => {
              const source = findJoinRecursively(
                draft.base,
                this.join.joinAlias
              );
              if (!source) {
                throw new Error(
                  `Couldn't find join for alias ${this.join.joinAlias}`
                );
              }
              goToAdjacentJoin(draft, this.join.joinAlias, targetTableRef);
            })
          );
        },
        addJoinOnForeignKey(sourceColumnName: string, columnValue: string) {
          if (!data) {
            throw new Error("No data");
          }
          if (!schemaData) {
            throw new Error("No schemaData");
          }
          setQuery(
            produce(data.preparedQuery, (draft) => {
              const sourceJoinAlias = this.join.joinAlias;
              const source = findJoinRecursively(draft.base, sourceJoinAlias);
              if (!source) {
                throw new Error(
                  `Couldn't find join for alias ${sourceJoinAlias}`
                );
              }
              const { join: sourceJoin } = source;
              const [sourceSchemaName, sourceTableName] = splitTableRef(
                sourceJoin.tableRef
              );
              const sourceTable = findTableFromSchemas(
                schemaData.schemas,
                sourceSchemaName,
                sourceTableName
              );
              const sourceColumn = sourceTable.columns.find(
                (column) => column.name === sourceColumnName
              );
              if (!sourceColumn) {
                throw new Error(`Column ${sourceColumnName} not found`);
              }
              const fk = sourceColumn.foreignKeys[0];
              if (!fk) {
                throw new Error(`No foreign key found`);
              }
              const targetTable = findTableFromSchemas(
                schemaData.schemas,
                fk.foreignSchemaName,
                fk.foreignTableName
              );
              const targetColumn = targetTable.columns.find(
                (column) => column.name === fk.foreignColumnName
              );
              if (!targetColumn) {
                throw new Error(`Column ${fk.foreignColumnName} not found`);
              }
              goToAdjacentJoin(
                draft,
                sourceJoinAlias,
                `${fk.foreignSchemaName}.${fk.foreignTableName}`,
                {
                  column: targetColumn.name,
                  value: columnValue,
                }
              );
            })
          );
        },
        addJoinOnForeignKeyReference(
          targetTableRef: string,
          targetColumnName: string,
          columnValue: string
        ) {
          if (!data) {
            throw new Error("No data");
          }
          setQuery(
            produce(data.preparedQuery, (draft) => {
              goToAdjacentJoin(draft, this.join.joinAlias, targetTableRef, {
                column: targetColumnName,
                value: columnValue,
              });
            })
          );
        },
        hasCondition(condition: ValueCondition) {
          if (!this.join.where) {
            return false;
          }
          const conditionMatches = (otherCondition: Condition) =>
            isValueCondition(otherCondition) &&
            otherCondition.column === condition.column &&
            otherCondition.operator === condition.operator &&
            otherCondition.value === condition.value;
          if (
            isBooleanCondition(this.join.where) &&
            this.join.where.operator === ConditionOperator.AND
          ) {
            return this.join.where.conditions.some(conditionMatches);
          }
          return conditionMatches(this.join.where);
        },
      };
    },
    [data, schemaData, hiddenColumnRefs, setQuery, goToAdjacentJoin]
  );

  const dataReturn = useMemo(() => {
    return data
      ? {
          rows: data.rows,
          count: data.count,
          visibleJoins: data.visibleJoins.map((joinItem) => ({
            ...joinItem,
            columns: joinItem.columns.filter(
              (column) =>
                !hiddenColumnRefs.has(
                  `${joinItem.join.tableRef}.${column.name}`
                )
            ),
          })),
        }
      : null;
  }, [data, hiddenColumnRefs]);

  return {
    data: dataReturn,
    query: data?.preparedQuery,
    isLoading: isFetching,
    error,
    joinActions,
  };
}

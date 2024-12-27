"use client";

import { useQuery } from "@tanstack/react-query";
import Spinner from "@/components/Spinner";
import { createElement, useEffect, useMemo, useRef, useState } from "react";
import classNames from "classnames";
import ErrorAlert from "@/components/ErrorAlert";
import { GoLink } from "react-icons/go";
import {
  Popover,
  PopoverButton,
  PopoverPanel,
  Switch,
} from "@headlessui/react";
import {
  AiOutlineArrowRight,
  AiOutlineClose,
  AiOutlineLink,
} from "react-icons/ai";
import { fetchRelatedRows, Row, WhereCondition } from "@quory/core";
import { SlArrowRight } from "react-icons/sl";
import Link from "next/link";
import { getDataForEntity } from "@/app/api/[organisationId]/insights/data/entity/route";
import FullPageLoading from "@/components/FullPageLoading";
import InsightsService from "@/services/InsightsService";
import { getDataForQuery } from "@/app/api/[organisationId]/insights/data/query/route";
import pluralize from "pluralize";
import renderDataValue from "@/util/renderDataValue";
import DataTable from "../DataTable";
import useAdvancedMode from "./hooks/useAdvancedMode";

export default function AdvancedMode({
  ticketId,
  organisationId,
  summary,
}: {
  ticketId: string;
  organisationId: string;
  summary: Awaited<ReturnType<typeof InsightsService.getInsightsSummary>>;
}) {
  const [selectedTableRef, setSelectedTableRef] = useState("");

  const { data } = useAdvancedMode();

  const setDefaultQueryForTable = (tableRef: string) => {
    setDataQuery({
      joins:
        tableRef === `${summary.userTableSchema}.${summary.userTableName}`
          ? []
          : [
              {
                tableRef,
                select: "*",
                where: {},
              },
            ],
    });
  };

  if (dataError) {
    return <ErrorAlert>Something went wrong</ErrorAlert>;
  }

  if (dataLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner
          wrapperClassName="aspect-square w-[10%] max-w-[80px]"
          className="h-full w-full fill-blue-600 text-blue-200"
        />
      </div>
    );
  }

  const goToTable = (
    tableRef: string,
    foreignKey?: {
      columnName: string;
      value: string;
    }
  ) => {
    if (!data) {
      throw new Error("No data");
    }
    setSelectedTableRef(tableRef);
    if (!foreignKey || data.path[data.path.length - 1] === tableRef) {
      const indexInPath = data.path.indexOf(tableRef);
      const newVia = data.path.slice(0, indexInPath + 1);
      setDataQuery((prev) => {
        if (!prev) {
          throw new Error("No existing query");
        }
        const joins = prev.joins
          .filter((join) => newVia.includes(join.tableRef))
          .map((join): typeof join => ({
            ...join,
            select: join.tableRef === tableRef ? "*" : [],
          }));
        if (
          ![
            ...joins.map((join) => join.tableRef),
            `${summary.userTableSchema}.${summary.userTableName}`,
          ].includes(tableRef)
        ) {
          joins.push({
            tableRef,
            select: "*",
            via: newVia.slice(1, indexInPath),
            where: {},
          });
        }
        return {
          joins,
        };
      });
    } else {
      setDataQuery((prev) => {
        if (!data) {
          throw new Error("No data");
        }
        if (!prev) {
          throw new Error("No existing query");
        }
        const via = data.path.slice(1, data.path.length);
        if (via[via.length - 2] === tableRef) {
          via.pop();
          via.pop();
        }
        return {
          joins: [
            ...prev.joins
              .filter(
                (join) => join.where && Object.entries(join.where).length >= 1
              )
              .map((join): typeof join => ({
                ...join,
                select: [],
              })),
            {
              tableRef,
              select: "*",
              via,
              where: {
                [foreignKey.columnName]: {
                  operator: "=",
                  value: foreignKey.value,
                },
              },
            },
          ],
        };
      });
    }
  };
  const goToPathIndex = (index: number) => {
    console.log("going to index", index);
    if (!data) {
      throw new Error("No data");
    }
    const tableRef = data.path[index];
    if (!tableRef) {
      throw new Error(`No table ref at index ${index}`);
    }
    setSelectedTableRef(tableRef);
    setDataQuery((prev) => {
      if (!prev) {
        throw new Error("No existing query");
      }
      const newPath = data.path.slice(0, index + 1);
      const newJoins = prev.joins
        .filter(
          (join) =>
            join.via &&
            newPath
              .slice(0, newPath.length - 1)
              .join(",")
              .includes(join.via.join(","))
        )
        .map((join) => ({
          ...join,
          select: join.tableRef === tableRef ? "*" : [],
        }));
      if (!newJoins.some((join) => join.tableRef === tableRef)) {
        newJoins.push({
          tableRef,
          select: "*",
          via: newPath.slice(1, index),
          where: {},
        });
      }
      return {
        joins: newJoins,
      };
    });
  };

  if (dataLoading) {
    return <FullPageLoading />;
  }

  return (
    <div className="w-full bg-white text-stone-900">
      <div className="mb-3 flex justify-between px-4">
        <select
          value={selectedTableRef}
          onChange={(e) => {
            setSelectedTableRef(e.target.value);
            setDefaultQueryForTable(e.target.value);
          }}
        >
          <option value="">Select a table</option>
          <option value={`${summary.userTableSchema}.${summary.userTableName}`}>
            {pluralize(summary.userTableName)}
          </option>
          {summary.userRelatedTables.map((table) => (
            <option
              key={`${table.schemaName}.${table.name}`}
              value={`${table.schemaName}.${table.name}`}
            >
              {table.name}
            </option>
          ))}
        </select>
      </div>

      {dataQuery && data && (
        <>
          <div className="flex items-center gap-3">
            {data.path.map((tableRef, i, arr) => {
              const relatedTableName = (() => {
                if (
                  tableRef ===
                  `${summary.userTableSchema}.${summary.userTableName}`
                ) {
                  return pluralize(summary.userTableName);
                }
                const relation = summary.userRelatedTables.find(
                  (r) => `${r.schemaName}.${r.name}` === tableRef
                )?.name;
                if (relation) {
                  return pluralize(relation);
                }
                return (
                  <div className="flex items-center gap-1">
                    <GoLink />
                    {tableRef.split(".")[1]}
                  </div>
                );
              })();
              const prevCountOfThisTableInPath = data.path
                .slice(0, i)
                .filter((t) => t === tableRef).length;
              const join = [data.query.base, ...data.query.joins].filter(
                (_join) => _join.tableRef === tableRef
              )[prevCountOfThisTableInPath];
              return (
                <>
                  <div>
                    {i === arr.length - 1 ? (
                      <span className="font-bold">{relatedTableName}</span>
                    ) : (
                      <button onClick={() => goToPathIndex(i)}>
                        {relatedTableName}
                      </button>
                    )}
                    {join &&
                      join.where &&
                      Object.entries(join.where).map(([key, condition]) => (
                        <button
                          key={key}
                          className={classNames(
                            "group flex items-center gap-2 rounded-full bg-slate-300 pl-2 pr-1 transition-all hover:bg-slate-200"
                          )}
                          onClick={() => {
                            setDataQuery((prev) => {
                              if (!prev) {
                                throw new Error("No existing query");
                              }
                              return {
                                joins: prev.joins.map((_join) => ({
                                  ..._join,
                                  where: _join.where
                                    ? Object.fromEntries(
                                        Object.entries(_join.where).filter(
                                          ([k]) => k !== key
                                        )
                                      )
                                    : undefined,
                                })),
                              };
                            });
                          }}
                        >
                          {(function renderCondition(
                            cond: WhereCondition
                          ): string {
                            if (typeof cond === "string") {
                              return `${key} = ${cond}`;
                            }
                            if (
                              cond.operator === "or" ||
                              cond.operator === "and"
                            ) {
                              return cond.conditions
                                .map(renderCondition)
                                .join(` ${cond.operator.toUpperCase()} `);
                            }
                            return `${key} ${cond.operator} ${cond.value}`;
                          })(condition)}
                          <div
                            className={classNames(
                              "my-1 rounded-full p-1 transition-all group-hover:bg-slate-500"
                            )}
                          >
                            <AiOutlineClose
                              size={14}
                              className="text-slate-700 transition-all group-hover:text-white"
                            />
                          </div>
                        </button>
                      ))}
                  </div>
                  {i < arr.length - 1 && <AiOutlineArrowRight size={20} />}
                </>
              );
            })}
          </div>
          {data.rows.length >= 1 ? (
            <DataTable
              entityName={selectedTableRef}
              rows={data.rows}
              onRelatedEntityClick={(related) => {}}
              relatedEntities={summary.userRelatedTables}
              organisationId={organisationId}
              onForeignKeyClick={(foreignKey, value) => {
                goToTable(
                  `${foreignKey.foreignSchemaName}.${foreignKey.foreignTableName}`,
                  {
                    columnName: foreignKey.foreignColumnName,
                    value,
                  }
                );
              }}
            />
          ) : (
            <div className="flex items-center justify-center">
              <span className="text-gray-500">No results</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

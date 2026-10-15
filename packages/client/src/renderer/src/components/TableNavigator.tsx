import { memo, useMemo } from "react";
import {
  findTableFromSchemas,
  splitTableRef,
  type PreparedQuery,
} from "@quory/core";
import type { useQuery, useFetchSchema } from "@quory/stack/react";
import { Filter, MoreHorizontal, Network, Table2, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Hint } from "./Hint";
import { cn } from "../lib/utils";
import JoinAnotherTableButton from "./JoinAnotherTableButton";
import { countFilters, QueryFilterPopover } from "./QueryFilters";
import { layoutTableDiagram } from "./tableNavigatorLayout";
import useElementSize from "../hooks/useElementSize";

import { TableColumnsMenu } from "./TableColumnsMenu";

type UseQueryRet = ReturnType<typeof useQuery>;

export default memo(TableNavigator);

function TableNavigator({
  width,
  maxHeight = 440,
  joinActions,
  query,
  schemas,
  highlightedJoinAlias,
  onChangeHighlightedJoinAlias,
  onDeleteQuery,
}: {
  width: number;
  maxHeight?: number;
  joinActions: UseQueryRet["joinActions"];
  query: PreparedQuery;
  schemas: NonNullable<ReturnType<typeof useFetchSchema>["data"]>["schemas"];
  highlightedJoinAlias: string | null;
  onChangeHighlightedJoinAlias: (joinAlias: string | null) => void;
  onDeleteQuery: () => void;
}) {
  const diagramSize = useElementSize();
  const availableWidth = diagramSize.width || Math.max(1, width - 48);
  const layout = useMemo(
    () => layoutTableDiagram(query.base, availableWidth),
    [query, availableWidth]
  );

  return (
    <section aria-label="Table relationships" className="min-w-0 bg-white">
      <div className="flex items-center gap-2 px-4 pb-2 pt-3 text-xs">
        <Network aria-hidden="true" className="size-3.5 text-slate-500" />
        <h2 className="font-semibold text-slate-700">Relationships</h2>
        <span className="text-slate-400">
          {layout.nodes.length} {layout.nodes.length === 1 ? "table" : "tables"}
        </span>
      </div>
      <div
        role="region"
        aria-label="Relationship diagram"
        tabIndex={0}
        className="overflow-y-auto overflow-x-hidden px-4 py-3 focus-visible:outline focus-visible:outline-1 focus-visible:outline-teal-600"
        style={{
          maxHeight,
          scrollbarGutter: "stable",
          backgroundColor: "#ffffff",
          backgroundImage:
            "radial-gradient(circle, #cbd5e1 1px, transparent 1px)",
          backgroundSize: "11px 11px",
        }}
      >
        <div
          ref={diagramSize.ref}
          className="relative"
          style={{ height: layout.height }}
        >
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            width={layout.width}
            height={layout.height}
          >
            {layout.placeholders.map(({ join, points }) => (
              <polyline
                key={`add-${join.joinAlias}`}
                points={points.map(({ x, y }) => `${x},${y}`).join(" ")}
                fill="none"
                className="stroke-slate-400"
                strokeWidth={1.5}
                strokeDasharray="3 3"
              />
            ))}
            {[...layout.edges]
              .sort(
                (a, b) =>
                  Number(
                    a.source === highlightedJoinAlias ||
                      a.target === highlightedJoinAlias
                  ) -
                  Number(
                    b.source === highlightedJoinAlias ||
                      b.target === highlightedJoinAlias
                  )
              )
              .map((edge) => {
                const active =
                  edge.source === highlightedJoinAlias ||
                  edge.target === highlightedJoinAlias;
                const end = edge.points[edge.points.length - 1]!;
                return (
                  <g key={edge.target}>
                    <polyline
                      points={edge.points
                        .map(({ x, y }) => `${x},${y}`)
                        .join(" ")}
                      fill="none"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      className="stroke-white"
                      strokeWidth={6}
                    />
                    <polyline
                      points={edge.points
                        .map(({ x, y }) => `${x},${y}`)
                        .join(" ")}
                      fill="none"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      className={
                        active ? "stroke-teal-600" : "stroke-slate-300"
                      }
                      strokeWidth={active ? 2 : 1.5}
                    />
                    <circle
                      cx={end.x}
                      cy={end.y}
                      r={2.5}
                      className={active ? "fill-teal-600" : "fill-slate-400"}
                    />
                  </g>
                );
              })}
          </svg>
          {layout.nodes.map(
            ({ join, parent, x, y, width: nodeWidth, height }) => {
              const [schemaName, tableName] = splitTableRef(join.tableRef);
              const table = findTableFromSchemas(
                schemas,
                schemaName,
                tableName
              );
              const actions = joinActions(join.joinAlias);
              const visibleColumns = actions.getVisibleColumns();
              const hidden = visibleColumns.length === 0;
              const filters = countFilters(join.where);
              const isRequiredBridge = Boolean(
                parent &&
                  join.select.length === 0 &&
                  !join.where &&
                  !join.orderBy?.length &&
                  join.joins.length > 0
              );
              const linkedTables = join.joins
                .map((child) => splitTableRef(child.tableRef)[1])
                .join(", ");
              const repeated = layout.nodes.filter(
                (node) => node.join.tableRef === join.tableRef
              );
              const instance =
                repeated.length > 1
                  ? ` · ${
                      repeated.findIndex(
                        (node) => node.join.joinAlias === join.joinAlias
                      ) + 1
                    }`
                  : "";
              return (
                <div
                  key={join.joinAlias}
                  role="group"
                  aria-label={`${join.tableRef}${instance}${
                    parent ? `, joined from ${parent.tableRef}` : ", base table"
                  }`}
                  className={cn(
                    "absolute flex flex-col justify-between rounded-lg border p-2.5 transition-colors",
                    hidden ? "bg-white" : "bg-slate-50",
                    highlightedJoinAlias === join.joinAlias
                      ? "border-teal-600"
                      : "border-slate-300"
                  )}
                  style={{ left: x, top: y, width: nodeWidth, height }}
                  onMouseEnter={() =>
                    onChangeHighlightedJoinAlias(join.joinAlias)
                  }
                  onMouseLeave={() => onChangeHighlightedJoinAlias(null)}
                  onFocus={() => onChangeHighlightedJoinAlias(join.joinAlias)}
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget))
                      onChangeHighlightedJoinAlias(null);
                  }}
                >
                  <div className="flex min-w-0 items-center gap-1">
                    <Table2
                      aria-hidden="true"
                      className={cn(
                        "mr-1 size-3.5 shrink-0",
                        hidden ? "text-slate-400" : "text-teal-700"
                      )}
                    />
                    <Hint
                      content={`${join.tableRef}${instance}${
                        hidden ? " · Click to show columns" : ""
                      }`}
                    >
                      {hidden ? (
                        <button
                          type="button"
                          aria-label={`Show columns for ${tableName}`}
                          className="min-w-0 flex-1 truncate rounded text-left text-sm font-medium text-slate-600 hover:text-teal-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
                          onClick={() =>
                            actions.setSelectedColumns(
                              table.columns.map((column) => column.name)
                            )
                          }
                        >
                          {tableName}
                          {instance}
                        </button>
                      ) : (
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
                          {tableName}
                          {instance}
                        </span>
                      )}
                    </Hint>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-6 shrink-0 rounded text-slate-400 shadow-none hover:bg-slate-100 hover:text-slate-800"
                          aria-label={`Actions for ${tableName}`}
                        >
                          <MoreHorizontal aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="border-slate-300 shadow-none"
                      >
                        <Hint
                          disabled={!isRequiredBridge}
                          content={`This table is used to link to the descendant ${
                            join.joins.length === 1 ? "table" : "tables"
                          } ${linkedTables}. Remove the descendant ${
                            join.joins.length === 1 ? "table" : "tables"
                          } first.`}
                          side="left"
                        >
                          <DropdownMenuItem
                            disabled={isRequiredBridge}
                            className="text-red-700 focus:text-red-700"
                            onSelect={() =>
                              parent ? actions.removeJoin() : onDeleteQuery()
                            }
                          >
                            <Trash2 aria-hidden="true" />
                            {parent
                              ? "Remove table from query"
                              : "Delete query"}
                          </DropdownMenuItem>
                        </Hint>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="flex min-w-0 items-center justify-between gap-1">
                    <TableColumnsMenu
                      table={table}
                      visibleColumns={visibleColumns}
                      actions={actions}
                    />
                    <QueryFilterPopover
                      join={join}
                      columns={table.columns}
                      joinActions={joinActions}
                    >
                      <button
                        type="button"
                        aria-label={
                          filters
                            ? `Edit ${filters} ${
                                filters === 1 ? "filter" : "filters"
                              } for ${tableName}`
                            : `Add filter for ${tableName}`
                        }
                        className={cn(
                          "flex h-6 shrink-0 items-center gap-1 rounded px-1.5 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600",
                          filters
                            ? "bg-teal-50 text-teal-800 hover:bg-teal-100"
                            : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        )}
                      >
                        <Filter aria-hidden="true" className="size-3" />
                        {filters
                          ? `${filters} ${filters === 1 ? "filter" : "filters"}`
                          : "Add filter"}
                      </button>
                    </QueryFilterPopover>
                  </div>
                </div>
              );
            }
          )}
          {layout.placeholders.map(
            ({ join, x, y, width: placeholderWidth, height }) => (
              <div
                key={`add-${join.joinAlias}`}
                className="absolute"
                style={{ left: x, top: y, width: placeholderWidth, height }}
              >
                <JoinAnotherTableButton
                  joinActions={joinActions}
                  schemas={schemas}
                  parentJoin={join}
                  query={query}
                />
              </div>
            )
          )}
        </div>
      </div>
    </section>
  );
}

import { memo, useCallback, useMemo } from "react";
import {
  findTableFromSchemas,
  splitTableRef,
  type PreparedQuery,
} from "@quory/core";
import type { useQuery, useFetchSchema } from "@quory/stack/react";
import {
  Filter,
  Network,
  Table2,
  Trash2,
  Minus,
  Plus,
  RotateCcw,
} from "lucide-react";
import { Button } from "./ui/button";
import { Hint } from "./Hint";
import { cn } from "../lib/utils";
import JoinAnotherTableButton from "./JoinAnotherTableButton";
import { countFilters, QueryFilterPopover } from "./QueryFilters";
import { layoutTableDiagram } from "./tableNavigatorLayout";
import useElementSize from "../hooks/useElementSize";
import { useRelationshipCanvas } from "../hooks/useRelationshipCanvas";

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
}: {
  width: number;
  maxHeight?: number;
  joinActions: UseQueryRet["joinActions"];
  query: PreparedQuery;
  schemas: NonNullable<ReturnType<typeof useFetchSchema>["data"]>["schemas"];
  highlightedJoinAlias: string | null;
  onChangeHighlightedJoinAlias: (joinAlias: string | null) => void;
}) {
  const { ref: measureRef, width: canvasWidth } = useElementSize();
  const { ref: panRef, ...canvas } = useRelationshipCanvas();
  const canvasRef = useCallback(
    (element: HTMLDivElement | null) => {
      measureRef(element);
      panRef(element);
    },
    [measureRef, panRef],
  );
  const availableWidth = Math.max(1, (canvasWidth || width) - 32);
  const layout = useMemo(
    () => layoutTableDiagram(query.base, availableWidth),
    [query, availableWidth],
  );

  return (
    <section aria-label="Table relationships" className="min-w-0 bg-card">
      <div className="flex items-center gap-2 px-4 pt-3 pb-2 text-xs">
        <Network
          aria-hidden="true"
          className="size-3.5 text-muted-foreground"
        />
        <h2 className="font-semibold text-foreground">Relationships</h2>
        <span className="font-mono text-muted-foreground">
          {layout.nodes.length} {layout.nodes.length === 1 ? "table" : "tables"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Hint content="Zoom out">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label="Zoom out relationships"
              disabled={canvas.view.scale <= 0.35}
              onClick={() => canvas.zoom(1 / 1.2)}
            >
              <Minus aria-hidden="true" className="size-3.5" />
            </Button>
          </Hint>
          <span className="w-9 text-center text-[10px] text-muted-foreground tabular-nums">
            {Math.round(canvas.view.scale * 100)}%
          </span>
          <Hint content="Zoom in">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label="Zoom in relationships"
              disabled={canvas.view.scale >= 2.5}
              onClick={() => canvas.zoom(1.2)}
            >
              <Plus aria-hidden="true" className="size-3.5" />
            </Button>
          </Hint>
          <Hint content="Reset view">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6"
              aria-label="Reset relationship canvas"
              onClick={canvas.reset}
            >
              <RotateCcw aria-hidden="true" className="size-3.5" />
            </Button>
          </Hint>
        </div>
      </div>
      <div
        ref={canvasRef}
        role="region"
        aria-label="Relationship diagram"
        tabIndex={0}
        aria-description="Drag to pan. Scroll to zoom. Use arrow keys to pan, plus or minus to zoom, and Home to reset."
        className={cn(
          "relative touch-none overflow-hidden select-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-primary",
          canvas.dragging ? "cursor-grabbing" : "cursor-grab",
        )}
        {...canvas.handlers}
        style={{
          height: Math.min(maxHeight, layout.height + 24),
          backgroundColor: "rgb(var(--card))",
          backgroundImage:
            "radial-gradient(circle, rgb(var(--border)) 1px, transparent 1px)",
          backgroundSize: `${11 * canvas.view.scale}px ${
            11 * canvas.view.scale
          }px`,
          backgroundPosition: `${canvas.view.x}px ${canvas.view.y}px`,
        }}
      >
        <div
          className="relative origin-top-left"
          style={{
            width: layout.width,
            height: layout.height,
            transform: `translate(${canvas.view.x}px, ${canvas.view.y}px) scale(${canvas.view.scale})`,
          }}
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
                className="stroke-muted-foreground"
                strokeWidth={1.5}
                strokeDasharray="3 3"
              />
            ))}
            {[...layout.edges]
              .sort(
                (a, b) =>
                  Number(
                    a.source === highlightedJoinAlias ||
                      a.target === highlightedJoinAlias,
                  ) -
                  Number(
                    b.source === highlightedJoinAlias ||
                      b.target === highlightedJoinAlias,
                  ),
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
                      className="stroke-primary-foreground"
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
                        active
                          ? "stroke-primary-emphasis"
                          : "stroke-muted-foreground"
                      }
                      strokeWidth={active ? 2 : 1.5}
                    />
                    <circle
                      cx={end.x}
                      cy={end.y}
                      r={2.5}
                      className={
                        active
                          ? "fill-primary-emphasis"
                          : "fill-muted-foreground"
                      }
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
                tableName,
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
                join.joins.length > 0,
              );
              const linkedTables = join.joins
                .map((child) => splitTableRef(child.tableRef)[1])
                .join(", ");
              const repeated = layout.nodes.filter(
                (node) => node.join.tableRef === join.tableRef,
              );
              const instance =
                repeated.length > 1
                  ? ` · ${
                      repeated.findIndex(
                        (node) => node.join.joinAlias === join.joinAlias,
                      ) + 1
                    }`
                  : "";
              return (
                <div
                  key={join.joinAlias}
                  role="group"
                  data-canvas-node
                  aria-label={`${join.tableRef}${instance}${
                    parent ? `, joined from ${parent.tableRef}` : ", base table"
                  }`}
                  className={cn(
                    "absolute flex cursor-auto flex-col justify-between rounded-lg border p-2.5 transition-colors",
                    hidden ? "border-dashed bg-background" : "bg-muted-light",
                    highlightedJoinAlias === join.joinAlias
                      ? "border-primary ring-1 ring-primary/25"
                      : hidden
                        ? "border-muted-foreground/30"
                        : "border-muted-foreground/50",
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
                        hidden
                          ? "text-muted-foreground"
                          : "text-primary-emphasis",
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
                          className="min-w-0 flex-1 truncate rounded-sm text-left text-sm font-medium text-muted-foreground hover:text-primary-emphasis focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                          onClick={() =>
                            actions.setSelectedColumns(
                              table.columns.map((column) => column.name),
                            )
                          }
                        >
                          {tableName}
                          {instance}
                        </button>
                      ) : (
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                          {tableName}
                          {instance}
                        </span>
                      )}
                    </Hint>
                    {parent && (
                      <Hint
                        content={
                          isRequiredBridge
                            ? `This table is used to link to the descendant ${
                                join.joins.length === 1 ? "table" : "tables"
                              } ${linkedTables}. Remove the descendant ${
                                join.joins.length === 1 ? "table" : "tables"
                              } first.`
                            : "Remove table from query"
                        }
                        side="left"
                      >
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          disabled={isRequiredBridge}
                          className="size-6 shrink-0 rounded-sm text-muted-foreground shadow-none hover:bg-destructive-subtle hover:text-destructive"
                          aria-label={`Remove ${tableName} from query`}
                          onClick={() => actions.removeJoin()}
                        >
                          <Trash2 aria-hidden="true" className="size-3.5" />
                        </Button>
                      </Hint>
                    )}
                  </div>
                  <div className="flex min-w-0 items-center justify-between gap-1">
                    <TableColumnsMenu
                      allowEmpty={join.joins.length > 0}
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
                          "flex h-6 shrink-0 items-center gap-1 rounded-sm px-1.5 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
                          filters
                            ? "bg-primary-subtle text-primary-emphasis hover:bg-primary-subtle"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
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
            },
          )}
          {layout.placeholders.map(
            ({ join, x, y, width: placeholderWidth, height }) => (
              <div
                key={`add-${join.joinAlias}`}
                data-canvas-node
                className="absolute cursor-auto"
                style={{ left: x, top: y, width: placeholderWidth, height }}
              >
                <JoinAnotherTableButton
                  joinActions={joinActions}
                  schemas={schemas}
                  parentJoin={join}
                  query={query}
                />
              </div>
            ),
          )}
        </div>
      </div>
    </section>
  );
}

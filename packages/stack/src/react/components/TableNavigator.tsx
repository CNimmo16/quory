import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  findTableFromSchemas,
  splitTableRef,
  resolveRelationship,
  normalizeVia,
  type DatabaseTableInfo,
  type PreparedJoinDef,
  type RelationshipConstraint,
  type PreparedQuery,
} from "@quory/core";
import type useQuery from "../hooks/useQuery";
import type useFetchSchema from "../hooks/useFetchSchema";
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
import { JoinEdgeEditor } from "./JoinEdgeEditor";
import { Hint } from "./Hint";
import { cn } from "../lib/utils";
import JoinAnotherTableButton from "./JoinAnotherTableButton";
import { countFilters, QueryFilterPopover } from "./QueryFilters";
import { layoutTableDiagram, type DiagramPoint } from "./tableNavigatorLayout";
import { tableNavigatorRoutes } from "./tableNavigatorRoutes";
import useElementSize from "../hooks/useElementSize";
import { useRelationshipCanvas } from "../hooks/useRelationshipCanvas";

import { TableColumnsMenu } from "./TableColumnsMenu";
import { useJoinRanker } from "../JoinRankingContext";
import { Spinner } from "./LoadingState";
import {
  selectedColumnContext,
  shortlistJoinColumns,
  selectJoinColumns,
} from "./joinColumnSelection";

type UseQueryRet = ReturnType<typeof useQuery>;

export default memo(TableNavigator);

function connectorPath(points: DiagramPoint[]) {
  const distinct = points.filter(
    (point, index) =>
      index === 0 ||
      point.x !== points[index - 1]!.x ||
      point.y !== points[index - 1]!.y,
  );
  const first = distinct[0]!;
  let path = `M ${first.x} ${first.y}`;
  for (let index = 1; index < distinct.length - 1; index++) {
    const previous = distinct[index - 1]!;
    const corner = distinct[index]!;
    const next = distinct[index + 1]!;
    const before = Math.hypot(corner.x - previous.x, corner.y - previous.y);
    const after = Math.hypot(next.x - corner.x, next.y - corner.y);
    const radius = Math.min(8, before / 2, after / 2);
    const entry = {
      x: corner.x + ((previous.x - corner.x) * radius) / before,
      y: corner.y + ((previous.y - corner.y) * radius) / before,
    };
    const exit = {
      x: corner.x + ((next.x - corner.x) * radius) / after,
      y: corner.y + ((next.y - corner.y) * radius) / after,
    };
    path += ` L ${entry.x} ${entry.y} Q ${corner.x} ${corner.y} ${exit.x} ${exit.y}`;
  }
  const last = distinct[distinct.length - 1]!;
  return `${path} L ${last.x} ${last.y}`;
}

function TableNavigator({
  width,
  maxHeight = 440,
  joinActions,
  query,
  schemas,
  highlightedJoinAlias,
  onChangeHighlightedJoinAlias,
  onRelationshipClick,
}: {
  width: number;
  maxHeight?: number;
  joinActions: UseQueryRet["joinActions"];
  query: PreparedQuery;
  schemas: NonNullable<ReturnType<typeof useFetchSchema>["data"]>["schemas"];
  highlightedJoinAlias: string | null;
  onChangeHighlightedJoinAlias: (joinAlias: string | null) => void;
  onRelationshipClick?:
    ((relationship: RelationshipConstraint) => void) | undefined;
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
  const joinedTables = useMemo(
    () => layout.nodes.map(({ join }) => join.tableRef).sort(),
    [layout],
  );

  const routes = useMemo(() => tableNavigatorRoutes(layout), [layout]);
  const [hoveredRoute, setHoveredRoute] = useState<string | null>(null);
  const [focusedRoute, setFocusedRoute] = useState<string | null>(null);
  const [openRoute, setOpenRoute] = useState<string | null>(null);
  const [hoveredCompact, setHoveredCompact] = useState(false);
  const ranker = useJoinRanker();
  const [choosingAlias, setChoosingAlias] = useState<string | null>(null);
  const pendingColumns = useRef<AbortController | null>(null);
  useEffect(() => {
    pendingColumns.current?.abort();
    pendingColumns.current = null;
    setChoosingAlias(null);
    return () => pendingColumns.current?.abort();
  }, [query, ranker, schemas]);
  const addIntermediateTable = async (
    join: PreparedJoinDef,
    parent: PreparedJoinDef,
    table: DatabaseTableInfo,
  ) => {
    if (pendingColumns.current || !table.columns.length) return;
    const context = selectedColumnContext(query.base);
    const { candidates, fallback } = shortlistJoinColumns(
      table,
      context.flatMap(({ columns }) => columns),
    );
    let columns = fallback;
    if (ranker && candidates.length > 1) {
      const controller = new AbortController();
      pendingColumns.current = controller;
      setChoosingAlias(join.joinAlias);
      const joinPath = join.joins.length
        ? `${parent.tableRef} -> ${join.tableRef} -> ${join.joins
            .map((child) => child.tableRef)
            .join(", ")}`
        : `${parent.tableRef} -> ${join.tableRef}`;
      columns = await selectJoinColumns(
        ranker,
        {
          kind: "columns",
          sourceTable: parent.tableRef,
          targetTable: join.tableRef,
          joinedTables: context.map(({ tableRef }) => tableRef),
          selectedColumns: context,
          joinPath: joinPath.slice(0, 12000),
          candidates,
        },
        fallback,
        table.columns.map(({ name }) => name),
        controller.signal,
      );
      if (controller.signal.aborted) return;
      pendingColumns.current = null;
      setChoosingAlias(null);
    }
    joinActions(join.joinAlias).setSelectedColumns(columns);
  };
  const compactHighlighted = layout.nodes.some(
    (node) => node.compact && node.join.joinAlias === highlightedJoinAlias,
  );
  const tableOnlyHighlight = hoveredCompact || compactHighlighted;
  const activeRoute = tableOnlyHighlight
    ? null
    : (openRoute ?? hoveredRoute ?? focusedRoute);
  const routeForEdge = (targetAlias: string) => {
    const matches = routes.filter((route) =>
      route.edges.some((edge) => edge.target === targetAlias),
    );
    return (
      matches.find((route) => route.target.join.joinAlias === activeRoute) ??
      matches[0]
    );
  };
  const clipId = useId();
  // The hover surface must never cover cards or their Join table controls,
  // including when a long route folds onto another row.
  const routeClip = [
    `M0 0H${layout.width}V${layout.height}H0Z`,
    ...[
      ...layout.nodes.filter((node) => !node.compact),
      ...layout.placeholders,
    ].map((node) => {
      const gap = "compact" in node ? 16 : 4;
      return `M${node.x - gap} ${node.y - gap}h${node.width + gap * 2}v${node.height + gap * 2}h${-node.width - gap * 2}Z`;
    }),
  ].join(" ");
  const routeAt = (target: EventTarget) =>
    (target as Element)
      .closest?.("[data-route-target]")
      ?.getAttribute("data-route-target") ?? null;

  return (
    <section aria-label="Table relationships" className="bg-card min-w-0">
      <div className="flex items-center gap-2 px-4 pt-3 pb-2 text-xs">
        <Network
          aria-hidden="true"
          className="text-muted-foreground size-3.5"
        />
        <h2 className="text-foreground font-semibold">Relationships</h2>
        <span className="text-muted-foreground font-mono">
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
          <span className="text-muted-foreground w-9 text-center text-[10px] tabular-nums">
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
          "focus-visible:outline-primary relative touch-none overflow-hidden select-none focus-visible:outline focus-visible:outline-1",
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
          onMouseMove={(event) => {
            setHoveredRoute(routeAt(event.target));
            setHoveredCompact(
              Boolean(
                (event.target as Element).closest("[data-compact-table]"),
              ),
            );
          }}
          onMouseLeave={() => {
            setHoveredRoute(null);
            setHoveredCompact(false);
          }}
          onFocusCapture={(event) => setFocusedRoute(routeAt(event.target))}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget))
              setFocusedRoute(null);
          }}
          style={{
            width: layout.width,
            height: layout.height,
            transform: `translate(${canvas.view.x}px, ${canvas.view.y}px) scale(${canvas.view.scale})`,
          }}
        >
          <svg
            aria-label="Relationship connections"
            className="pointer-events-none absolute inset-0"
            width={layout.width}
            height={layout.height}
          >
            <defs>
              <clipPath id={clipId}>
                <path d={routeClip} clipRule="evenodd" />
              </clipPath>
            </defs>
            {routes
              .filter((route) => route.intermediate.length > 0)
              .map((route) => (
                <g
                  key={`hover-${route.target.join.joinAlias}`}
                  clipPath={`url(#${clipId})`}
                >
                  <path
                    data-canvas-node
                    data-route-target={route.target.join.joinAlias}
                    aria-label={`Join path from ${route.source.join.tableRef} to ${route.target.join.tableRef}`}
                    d={connectorPath(route.bubble)}
                    fill="none"
                    strokeWidth={72}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    pointerEvents="stroke"
                    className={cn(
                      "stroke-primary/10 pointer-events-auto cursor-default transition-opacity duration-300 ease-out motion-reduce:transition-none",
                      activeRoute === route.target.join.joinAlias
                        ? "opacity-100"
                        : "opacity-0",
                    )}
                  />
                </g>
              ))}
            {layout.placeholders.map(({ join, points }) => (
              <polyline
                key={`add-${join.joinAlias}`}
                points={points.map(({ x, y }) => `${x},${y}`).join(" ")}
                fill="none"
                className="stroke-muted-foreground/40"
                strokeWidth={1}
                strokeDasharray="3 3"
                strokeLinecap="round"
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
                const source = layout.nodes.find(
                  (node) => node.join.joinAlias === edge.source,
                )?.join;
                const target = layout.nodes.find(
                  (node) => node.join.joinAlias === edge.target,
                )?.join;
                if (!source || !target) return null;
                let relationship: RelationshipConstraint | undefined;
                try {
                  const steps = normalizeVia(target.via);
                  relationship = resolveRelationship(
                    schemas,
                    source.tableRef,
                    steps[steps.length - 1] ?? { tableRef: target.tableRef },
                  ).relationship;
                } catch {
                  /* Legacy prepared queries may omit a relationship selector. */
                }
                const clickable =
                  relationship?.source === "inferred" && !!onRelationshipClick;
                const route = routeForEdge(edge.target);
                const active =
                  !tableOnlyHighlight &&
                  (route?.target.join.joinAlias === activeRoute ||
                    edge.source === highlightedJoinAlias ||
                    edge.target === highlightedJoinAlias);
                const end = edge.points[edge.points.length - 1]!;
                const path = connectorPath(edge.points);
                return (
                  <g
                    key={edge.target}
                    className="group/edge"
                    data-route-target={route?.target.join.joinAlias}
                  >
                    <g
                      role={clickable ? "button" : "group"}
                      tabIndex={0}
                      aria-label={
                        clickable
                          ? `Configure inferred relationship from ${source.tableRef} to ${target.tableRef}`
                          : `Relationship from ${source.tableRef} to ${target.tableRef}`
                      }
                      className="pointer-events-auto cursor-default"
                      onClick={
                        clickable
                          ? () => onRelationshipClick!(relationship!)
                          : undefined
                      }
                      onKeyDown={
                        clickable
                          ? (event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                event.stopPropagation();
                                onRelationshipClick!(relationship!);
                              }
                            }
                          : undefined
                      }
                    >
                      <path
                        d={path}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={16}
                        pointerEvents="stroke"
                      />
                      <path
                        d={path}
                        fill="none"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        className="stroke-card"
                        strokeWidth={5}
                      />
                      <path
                        d={path}
                        fill="none"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        className={cn(
                          !tableOnlyHighlight &&
                            "group-hover/edge:stroke-primary-emphasis group-focus-within/edge:stroke-primary-emphasis group-focus-within/edge:stroke-[2.5] group-hover/edge:stroke-[2.5]",
                          active
                            ? "stroke-primary-emphasis"
                            : "stroke-muted-foreground/55",
                        )}
                        strokeWidth={active ? 2 : 1.5}
                        strokeDasharray={
                          relationship?.source === "inferred"
                            ? "5 3"
                            : undefined
                        }
                      />
                      <circle
                        cx={end.x}
                        cy={end.y}
                        r={2}
                        className={cn(
                          !tableOnlyHighlight &&
                            "group-hover/edge:fill-primary-emphasis group-focus-within/edge:fill-primary-emphasis",
                          active
                            ? "fill-primary-emphasis"
                            : "fill-muted-foreground/65",
                        )}
                      />
                    </g>
                  </g>
                );
              })}
            {routes.map((route) => {
              let replacedIntermediates = 0;
              for (const node of [...route.intermediate].reverse()) {
                if (node.join.joins.length !== 1) break;
                replacedIntermediates++;
              }
              return (
                <g
                  key={`edit-${route.target.join.joinAlias}`}
                  data-route-target={route.target.join.joinAlias}
                >
                  <JoinEdgeEditor
                    position={route.button}
                    active={activeRoute === route.target.join.joinAlias}
                    onOpenChange={(open) =>
                      setOpenRoute(open ? route.target.join.joinAlias : null)
                    }
                    schemas={schemas}
                    source={route.source.join.tableRef}
                    target={route.target.join.tableRef}
                    joinedTables={joinedTables}
                    replacedIntermediates={replacedIntermediates}
                    onSelect={(steps) =>
                      joinActions(route.target.join.joinAlias).setJoinRoute(
                        steps,
                        route.source.join.joinAlias,
                      )
                    }
                  />
                </g>
              );
            })}
          </svg>
          {layout.nodes.map(
            ({ join, parent, x, y, width: nodeWidth, height, compact }) => {
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
              if (compact) {
                return (
                  <div
                    key={join.joinAlias}
                    role="group"
                    data-canvas-node
                    data-compact-table
                    aria-label={`${join.tableRef}${instance}, joined from ${parent!.tableRef}`}
                    className="absolute"
                    style={{ left: x, top: y, width: nodeWidth, height }}
                    onMouseEnter={() => {
                      setHoveredCompact(true);
                      setHoveredRoute(null);
                      onChangeHighlightedJoinAlias(join.joinAlias);
                    }}
                    onMouseLeave={() => {
                      setHoveredCompact(false);
                      onChangeHighlightedJoinAlias(null);
                    }}
                    onFocus={() => onChangeHighlightedJoinAlias(join.joinAlias)}
                    onBlur={() => onChangeHighlightedJoinAlias(null)}
                  >
                    <Hint
                      content={
                        <span>
                          Click to add{" "}
                          <span className="font-mono">{tableName}</span> to the
                          query.
                        </span>
                      }
                    >
                      <button
                        type="button"
                        disabled={choosingAlias !== null}
                        aria-busy={choosingAlias === join.joinAlias || undefined}
                        aria-label={`Add ${tableName}${instance} to query`}
                        className={cn(
                          "bg-background text-muted-foreground hover:border-primary hover:text-primary-emphasis focus-visible:outline-primary inline-flex size-full cursor-pointer items-center justify-center gap-1.5 truncate rounded-md border px-3 text-sm font-medium ring-1 transition-[color,border-color,box-shadow] duration-300 ease-out focus-visible:outline focus-visible:outline-2 disabled:cursor-wait motion-reduce:transition-none",
                          highlightedJoinAlias === join.joinAlias
                            ? "border-primary ring-primary/25"
                            : "border-muted-foreground/30 ring-transparent",
                        )}
                        onClick={() =>
                          void addIntermediateTable(join, parent!, table)
                        }
                      >
                        {choosingAlias === join.joinAlias && (
                          <Spinner className="size-3 shrink-0" />
                        )}
                        <span className="truncate">
                          {tableName}
                          {instance}
                        </span>
                      </button>
                    </Hint>
                  </div>
                );
              }
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
                    hidden ? "bg-background border-dashed" : "bg-muted/40",
                    highlightedJoinAlias === join.joinAlias
                      ? "border-primary ring-primary/25 ring-1"
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
                          className="text-muted-foreground hover:text-primary-emphasis focus-visible:outline-primary min-w-0 flex-1 truncate rounded-sm text-left text-sm font-medium focus-visible:outline focus-visible:outline-2"
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
                        <span className="text-foreground min-w-0 flex-1 truncate text-sm font-semibold">
                          {tableName}
                          {instance}
                        </span>
                      )}
                    </Hint>
                    {(parent || join.joins.length > 0) && (
                      <Hint content="Remove table from query" side="left">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="text-muted-foreground hover:bg-destructive-subtle hover:text-destructive size-6 shrink-0 rounded-sm shadow-none"
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
                          "focus-visible:outline-primary flex h-6 shrink-0 items-center gap-1 rounded-sm px-1.5 text-xs focus-visible:outline focus-visible:outline-2",
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

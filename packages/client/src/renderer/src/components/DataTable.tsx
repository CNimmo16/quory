import { Button } from "./ui/button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { ConditionOperator, splitTableRef } from "@quory/core";
import { useQuery } from "@quory/stack/react";
import { memo, useMemo, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  EyeOff,
  Filter,
  Link,
  MoreHorizontal,
  Table2,
} from "lucide-react";
import classNames from "classnames";

import { Spinner } from "./LoadingState";
import { TableColumnsMenu } from "./TableColumnsMenu";

type UseQueryRet = ReturnType<typeof useQuery>;
type QueryData = NonNullable<UseQueryRet["data"]>;

const ROW_HEIGHT = 36;
const EMPTY_JOINS: QueryData["visibleJoins"] = [];
const EMPTY_ROWS: QueryData["rows"] = [];

export default memo(DataTable);

type PlainValue = string | number | boolean | null;
type DataTableProps = {
  width?: number;
  height?: number;
  isLoading?: boolean;
  highlightedJoinAlias?: string | null;
  onChangeHighlightedJoinAlias?: (joinAlias: string | null) => void;
  summary?: ReactNode;
  emptyMessage?: string;
  embedded?: boolean;
} & (
  | {
      rows: QueryData["rows"];
      visibleJoins: QueryData["visibleJoins"];
      joinActions?: UseQueryRet["joinActions"];
      columns?: never;
    }
  | {
      rows: PlainValue[][];
      columns: string[];
      visibleJoins?: never;
      joinActions?: never;
    }
);
type Column = {
  key: string;
  name: string;
  readableName: string;
  join?: QueryData["visibleJoins"][number]["join"];
  joinIndex: number;
  columnIndex: number;
};

function DataTable(props: DataTableProps) {
  const {
    width,
    height = 480,
    isLoading = false,
    highlightedJoinAlias,
    onChangeHighlightedJoinAlias,
    joinActions,
    summary,
    emptyMessage = "No records found",
    embedded = false,
  } = props;
  const unorderedJoins = props.visibleJoins ?? EMPTY_JOINS;
  const rows = props.columns === undefined ? props.rows : EMPTY_ROWS;
  const [tableOrder, setTableOrder] = useState<string[]>([]);
  const [draggedAlias, setDraggedAlias] = useState<string | null>(null);
  const visibleJoins = useMemo(() => {
    const aliases = [
      ...tableOrder.filter((alias) =>
        unorderedJoins.some(({ join }) => join.joinAlias === alias),
      ),
      ...unorderedJoins
        .map(({ join }) => join.joinAlias)
        .filter((alias) => !tableOrder.includes(alias)),
    ];
    return aliases.map((alias) =>
      unorderedJoins.find(({ join }) => join.joinAlias === alias)!,
    );
  }, [unorderedJoins, tableOrder]);
  function moveTable(source: string, target: string) {
    const order = visibleJoins.map(({ join }) => join.joinAlias);
    if (source === target || !order.includes(source)) return;
    const targetIndex = order.indexOf(target);
    order.splice(order.indexOf(source), 1);
    order.splice(targetIndex, 0, source);
    setTableOrder(order);
    setSelectedCell(null);
  }
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const rowSpans = useMemo(
    () =>
      visibleJoins.map(({ join }) => {
        const spans = rows.map(() => 1);
        let start = 0;
        let previousKey: string | null = null;
        rows.forEach((row, index) => {
          const key =
            row.find((cells) => cells[0]?.joinAlias === join.joinAlias)?.[0]
              ?.recordKey ?? null;
          // Merge only consecutive occurrences within this table instance.
          // Sorting and the relationships represented by each result row stay intact.
          if (key !== null && key === previousKey) {
            spans[start]! += 1;
            spans[index] = 0;
          } else {
            start = index;
          }
          previousKey = key;
        });
        return spans;
      }),
    [rows, visibleJoins],
  );
  const columns = useMemo<Column[]>(
    () =>
      props.columns !== undefined
        ? props.columns.map((name, index) => ({
            key: String(index),
            name,
            readableName: name,
            joinIndex: 0,
            columnIndex: index,
          }))
        : visibleJoins.flatMap(({ join, columns: joinColumns }, joinIndex) =>
            joinColumns.map((column, columnIndex) => ({
              ...column,
              key: `${join.joinAlias}:${column.name}`,
              join,
              joinIndex,
              columnIndex,
            })),
          ),
    [visibleJoins, props.columns],
  );

  function getCell(
    rowIndex: number,
    column: { join: Column["join"]; columnIndex: number; name: string },
  ) {
    if (props.columns !== undefined) {
      const value = props.rows[rowIndex]?.[column.columnIndex] ?? null;
      return {
        rawValue: value,
        readableValue: value === null ? "NULL" : String(value),
        type: typeof value === "number" ? "number" : "text",
        foreignKey: undefined,
      };
    }
    return props.rows[rowIndex]
      ?.find((cells) => cells[0]?.joinAlias === column.join?.joinAlias)
      ?.find((cell) => cell.rawField === column.name);
  }

  const Container = embedded ? "div" : "section";
  return (
    <Container
      aria-label={embedded ? undefined : "Query results"}
      aria-busy={isLoading}
      style={{
        width: width === undefined ? "100%" : Math.max(0, width),
        height,
      }}
      className={classNames(
        "flex max-w-full min-w-0 flex-col overflow-hidden bg-card text-xs text-foreground",
        !embedded && "rounded-lg border border-border",
      )}
    >
      {!embedded && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-3 py-2.5">
          <div className="flex items-center gap-2">
            {isLoading ? (
              <span
                role="status"
                title="Running query…"
                className="size-3.5 text-muted-foreground"
              >
                <Spinner className="size-3.5" />
                <span className="sr-only">Running query…</span>
              </span>
            ) : (
              <Table2 className="size-3.5 text-muted-foreground" />
            )}
            <span className="font-semibold text-foreground">Results</span>
            <span className="text-muted-foreground tabular-nums">
              {props.rows.length} rows
            </span>
          </div>
          {summary && (
            <div className="flex flex-wrap gap-3 text-muted-foreground">
              {summary}
            </div>
          )}
        </div>
      )}
      <div
        role="region"
        aria-label="Scrollable query results"
        tabIndex={0}
        className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-primary"
        onScroll={() => setSelectedCell(null)}
        onMouseLeave={() => onChangeHighlightedJoinAlias?.(null)}
      >
        <table
          aria-label="Query results table"
          className="w-max min-w-full table-auto border-separate border-spacing-0 text-left"
        >
          <thead className="sticky top-0 z-10">
            {visibleJoins.length > 0 && (
              <tr>
                {visibleJoins.map(
                  ({ join, columns: joinColumns, table }, index) =>
                    joinColumns.length > 0 && (
                      <th
                        key={join.joinAlias}
                        scope="colgroup"
                        colSpan={joinColumns.length}
                        className={classNames(
                          "h-9 border-b px-3 font-semibold transition-colors",
                          index > 0 && "border-l-2 border-l-border",
                          highlightedJoinAlias === join.joinAlias
                            ? "border-b-primary bg-primary-subtle text-primary-emphasis"
                            : "border-b-border bg-background text-foreground",
                        )}
                        onDragOver={(event) => {
                          if (draggedAlias) {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                            const sourceIndex = visibleJoins.findIndex(
                              ({ join: source }) =>
                                source.joinAlias === draggedAlias,
                            );
                            const bounds =
                              event.currentTarget.getBoundingClientRect();
                            const midpoint = bounds.left + bounds.width / 2;
                            // Cross the target's midpoint before moving, so repeated
                            // drag events don't swap the groups back after reflow.
                            if (
                              (sourceIndex < index &&
                                event.clientX > midpoint) ||
                              (sourceIndex > index && event.clientX < midpoint)
                            ) {
                              moveTable(draggedAlias, join.joinAlias);
                            }
                          }
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          setDraggedAlias(null);
                        }}
                        onMouseEnter={() =>
                          onChangeHighlightedJoinAlias?.(
                            join?.joinAlias ?? null,
                          )
                        }
                      >
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            draggable
                            aria-label={`Reorder ${
                              splitTableRef(join.tableRef)[1]
                            } table`}
                            title="Drag to reorder tables; use left and right arrow keys to move"
                            className="flex min-w-0 cursor-grab items-center gap-2 rounded-sm text-left focus-visible:outline-primary active:cursor-grabbing"
                            onDragStart={(event) => {
                              event.dataTransfer.effectAllowed = "move";
                              event.dataTransfer.setData(
                                "text/plain",
                                join.joinAlias,
                              );
                              setDraggedAlias(join.joinAlias);
                            }}
                            onDragEnd={() => setDraggedAlias(null)}
                            onKeyDown={(event) => {
                              const target =
                                visibleJoins[
                                  index +
                                    (event.key === "ArrowLeft"
                                      ? -1
                                      : event.key === "ArrowRight"
                                        ? 1
                                        : 0)
                                ];
                              if (
                                target &&
                                target.join.joinAlias !== join.joinAlias
                              ) {
                                event.preventDefault();
                                moveTable(
                                  join.joinAlias,
                                  target.join.joinAlias,
                                );
                              }
                            }}
                          >
                            <Table2 className="size-3.5 shrink-0 text-primary-emphasis" />
                            <span
                              className="max-w-50 truncate"
                              title={join.tableRef}
                            >
                              {splitTableRef(join.tableRef)[1]}
                            </span>
                          </button>
                          {joinActions && (
                            <div className="ml-auto font-normal">
                              <TableColumnsMenu
                                allowEmpty={join.joins.length > 0}
                                table={table}
                                visibleColumns={joinColumns.map(
                                  (column) => column.name,
                                )}
                                actions={joinActions(join.joinAlias)}
                              />
                            </div>
                          )}
                        </div>
                      </th>
                    ),
                )}
              </tr>
            )}
            <tr>
              {columns.map(
                ({ key, join, joinIndex, columnIndex, name, readableName }) => {
                  const order = join?.orderBy?.find(
                    (item) => item.column === name,
                  );
                  const sort = (direction: "asc" | "desc") =>
                    join &&
                    joinActions?.(join.joinAlias).orderBy(
                      [{ column: name, direction }],
                      { clearAllExistingOrders: true },
                    );
                  const SortIcon =
                    order?.direction === "asc"
                      ? ArrowUp
                      : order
                        ? ArrowDown
                        : ArrowUpDown;
                  return (
                    <th
                      key={key}
                      scope="col"
                      aria-sort={
                        !join || !joinActions
                          ? undefined
                          : order
                            ? order.direction === "asc"
                              ? "ascending"
                              : "descending"
                            : "none"
                      }
                      className={classNames(
                        "h-9 border-b border-border bg-card px-2 font-medium text-muted-foreground",
                        columnIndex === 0 && joinIndex > 0 && "border-l-2",
                      )}
                      onMouseEnter={() =>
                        onChangeHighlightedJoinAlias?.(join?.joinAlias ?? null)
                      }
                    >
                      <div className="flex min-w-0 items-center gap-1">
                        {join && joinActions ? (
                          <>
                            <button
                              type="button"
                              className="flex min-w-0 flex-1 items-center gap-2 rounded-sm px-1 py-1 text-left hover:text-primary-emphasis focus-visible:outline-primary"
                              aria-label={`Sort by ${readableName}`}
                              onClick={() =>
                                sort(
                                  order?.direction === "asc" ? "desc" : "asc",
                                )
                              }
                            >
                              <span
                                className="max-w-50 min-w-0 truncate"
                                title={readableName}
                              >
                                {readableName}
                              </span>
                              <SortIcon
                                className={classNames(
                                  "size-3 shrink-0",
                                  order
                                    ? "text-primary-emphasis"
                                    : "text-muted-foreground",
                                )}
                              />
                            </button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  aria-label={`Options for ${readableName}`}
                                  className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-primary"
                                >
                                  <MoreHorizontal className="size-3.5" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                className="shadow-none"
                              >
                                <DropdownMenuItem onSelect={() => sort("asc")}>
                                  <ArrowUp />
                                  Sort ascending
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => sort("desc")}>
                                  <ArrowDown />
                                  Sort descending
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={
                                    visibleJoins[joinIndex]!.columns.length ===
                                      1 && join.joins.length === 0
                                  }
                                  onSelect={() =>
                                    joinActions(
                                      join.joinAlias,
                                    ).setSelectedColumns(
                                      visibleJoins[joinIndex]!.columns.filter(
                                        (column) => column.name !== name,
                                      ).map((column) => column.name),
                                    )
                                  }
                                >
                                  <EyeOff />
                                  Hide column
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </>
                        ) : (
                          <span
                            className="max-w-50 min-w-0 truncate px-1 py-1"
                            title={readableName}
                          >
                            {readableName}
                          </span>
                        )}
                      </div>
                    </th>
                  );
                },
              )}
            </tr>
          </thead>
          <tbody>
            {props.rows.map((_row, rowIndex) => (
              <tr key={rowIndex} style={{ height: ROW_HEIGHT }}>
                {columns.map(
                  ({
                    key,
                    join,
                    joinIndex,
                    columnIndex,
                    name,
                    readableName,
                  }) => {
                    const rowSpan = join ? rowSpans[joinIndex]![rowIndex]! : 1;
                    if (rowSpan === 0) return null;
                    const cell = getCell(rowIndex, { join, columnIndex, name });
                    const id = `${rowIndex}:${key}`;
                    const text = cell?.readableValue ?? "";
                    const tableName = join
                      ? splitTableRef(join.tableRef)[1]
                      : undefined;
                    const label = `${
                      tableName ? `${tableName}, ` : ""
                    }${readableName}: ${text}`;
                    // Keep the single value visible beneath both header rows
                    // while scrolling through a tall merged record.
                    const content = (
                      <span
                        style={{
                          top: ROW_HEIGHT * (visibleJoins.length ? 2 : 1),
                          height: ROW_HEIGHT - 1,
                        }}
                        className="sticky flex shrink-0 items-center gap-2"
                      >
                        <span
                          className={classNames(
                            "max-w-50 min-w-0 flex-1 truncate",
                            cell?.type === "number" && "font-mono tabular-nums",
                            cell?.rawValue == null &&
                              "text-muted-foreground italic",
                          )}
                        >
                          {text}
                        </span>
                        {cell?.foreignKey && cell.rawValue != null && (
                          <Link className="size-3 shrink-0 text-primary-emphasis" />
                        )}
                      </span>
                    );
                    return (
                      <td
                        key={key}
                        rowSpan={rowSpan}
                        className={classNames(
                          "border-b border-border bg-card p-0 align-middle select-none",
                          columnIndex === 0 &&
                            joinIndex > 0 &&
                            "border-l-2 border-l-border",
                        )}
                        onMouseEnter={() =>
                          onChangeHighlightedJoinAlias?.(
                            join?.joinAlias ?? null,
                          )
                        }
                      >
                        {join &&
                        joinActions &&
                        cell?.foreignKey &&
                        cell.rawValue != null ? (
                          <button
                            type="button"
                            aria-label={`Follow relationship from ${label}`}
                            title={text}
                            style={{ height: rowSpan * ROW_HEIGHT - 1 }}
                            className="flex w-full min-w-35 flex-col px-3 text-left hover:bg-muted focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-primary"
                            onClick={() =>
                              joinActions(join.joinAlias).addJoinOnForeignKey(
                                name,
                                cell.rawValue.toString(),
                              )
                            }
                          >
                            {content}
                          </button>
                        ) : (
                          <Popover
                            open={selectedCell === id}
                            onOpenChange={(open) =>
                              setSelectedCell(open ? id : null)
                            }
                          >
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                aria-label={label}
                                title={text}
                                style={{ height: rowSpan * ROW_HEIGHT - 1 }}
                                className="flex w-full min-w-35 flex-col px-3 text-left hover:bg-muted focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-primary"
                              >
                                <PopoverAnchor asChild>{content}</PopoverAnchor>
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              align="start"
                              className="w-80 max-w-[calc(100vw-2rem)] space-y-3 border-border p-3 shadow-none"
                            >
                              <div className="text-[11px] font-medium text-muted-foreground">
                                {tableName ? `${tableName} · ` : ""}
                                {readableName}
                              </div>
                              <div className="max-h-48 overflow-auto text-sm wrap-break-word whitespace-pre-wrap text-foreground select-text">
                                {text || (
                                  <span className="text-muted-foreground italic">
                                    Empty value
                                  </span>
                                )}
                              </div>
                              {join && joinActions && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 gap-2 text-xs shadow-none"
                                  disabled={cell?.rawValue == null}
                                  onClick={() => {
                                    if (!cell || cell.rawValue == null) return;
                                    joinActions(join.joinAlias).setCondition({
                                      operator: ConditionOperator.AND,
                                      conditions: [
                                        ...(join.where ? [join.where] : []),
                                        {
                                          column: name,
                                          operator: ConditionOperator.EQUALS,
                                          value: cell.rawValue.toString(),
                                        },
                                      ],
                                    });
                                    setSelectedCell(null);
                                  }}
                                >
                                  <Filter className="size-3.5" />
                                  Filter on this value
                                </Button>
                              )}
                            </PopoverContent>
                          </Popover>
                        )}
                      </td>
                    );
                  },
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {props.rows.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">{emptyMessage}</p>
        )}
      </div>
    </Container>
  );
}

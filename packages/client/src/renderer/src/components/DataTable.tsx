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
import { memo, useMemo, useState } from "react";
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

export default memo(DataTable);

function DataTable({
  width,
  height,
  isLoading = false,
  highlightedJoinAlias,
  onChangeHighlightedJoinAlias,
  rows,
  visibleJoins: unorderedJoins,
  joinActions,
}: {
  width: number;
  height: number;
  isLoading?: boolean;
  highlightedJoinAlias: string | null;
  onChangeHighlightedJoinAlias: (joinAlias: string | null) => void;
  rows: QueryData["rows"];
  visibleJoins: QueryData["visibleJoins"];
  joinActions: UseQueryRet["joinActions"];
}) {
  const [tableOrder, setTableOrder] = useState<string[]>([]);
  const [draggedAlias, setDraggedAlias] = useState<string | null>(null);
  const visibleJoins = useMemo(() => {
    const aliases = [
      ...tableOrder.filter((alias) =>
        unorderedJoins.some(({ join }) => join.joinAlias === alias)
      ),
      ...unorderedJoins
        .map(({ join }) => join.joinAlias)
        .filter((alias) => !tableOrder.includes(alias)),
    ];
    return aliases.map(
      (alias) => unorderedJoins.find(({ join }) => join.joinAlias === alias)!
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
    [rows, visibleJoins]
  );
  const columns = useMemo(
    () =>
      visibleJoins.flatMap(({ join, columns: joinColumns }, joinIndex) =>
        joinColumns.map((column, columnIndex) => ({
          ...column,
          join,
          joinIndex,
          columnIndex,
        }))
      ),
    [visibleJoins]
  );

  return (
    <section
      aria-label="Query results"
      style={{ width: Math.max(0, width), height }}
      className="flex min-w-0 max-w-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white text-xs text-slate-700"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-200 px-3 py-2.5">
        <div className="flex items-center gap-2">
          {isLoading ? (
            <span
              role="status"
              title="Running query…"
              className="size-3.5 text-slate-500"
            >
              <Spinner className="size-3.5" />
              <span className="sr-only">Running query…</span>
            </span>
          ) : (
            <Table2 className="size-3.5 text-slate-500" />
          )}
          <span className="font-semibold text-slate-800">Results</span>
          <span className="tabular-nums text-slate-500">
            {rows.length} rows
          </span>
        </div>
      </div>
      <div
        role="region"
        aria-label="Scrollable query results"
        tabIndex={0}
        className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-teal-600"
        onScroll={() => setSelectedCell(null)}
        onMouseLeave={() => onChangeHighlightedJoinAlias(null)}
      >
        <table
          aria-label="Query results table"
          className="w-max min-w-full table-auto border-separate border-spacing-0 text-left"
        >
          <thead className="sticky top-0 z-10">
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
                        index > 0 && "border-l-2 border-l-slate-200",
                        highlightedJoinAlias === join.joinAlias
                          ? "border-b-teal-500 bg-teal-50 text-teal-900"
                          : "border-b-slate-200 bg-slate-50 text-slate-700"
                      )}
                      onDragOver={(event) => {
                        if (draggedAlias) {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          const sourceIndex = visibleJoins.findIndex(
                            ({ join: source }) =>
                              source.joinAlias === draggedAlias
                          );
                          const bounds =
                            event.currentTarget.getBoundingClientRect();
                          const midpoint = bounds.left + bounds.width / 2;
                          // Cross the target's midpoint before moving, so repeated
                          // drag events don't swap the groups back after reflow.
                          if (
                            (sourceIndex < index && event.clientX > midpoint) ||
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
                        onChangeHighlightedJoinAlias(join.joinAlias)
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
                          className="flex min-w-0 cursor-grab items-center gap-2 rounded text-left focus-visible:outline-teal-600 active:cursor-grabbing"
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData(
                              "text/plain",
                              join.joinAlias
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
                              moveTable(join.joinAlias, target.join.joinAlias);
                            }
                          }}
                        >
                          <Table2 className="size-3.5 shrink-0 text-teal-600" />
                          <span
                            className="max-w-[200px] truncate"
                            title={join.tableRef}
                          >
                            {splitTableRef(join.tableRef)[1]}
                          </span>
                        </button>
                        <div className="ml-auto font-normal">
                          <TableColumnsMenu
                            table={table}
                            visibleColumns={joinColumns.map(
                              (column) => column.name
                            )}
                            actions={joinActions(join.joinAlias)}
                          />
                        </div>
                      </div>
                    </th>
                  )
              )}
            </tr>
            <tr>
              {columns.map(
                ({ join, joinIndex, columnIndex, name, readableName }) => {
                  const order = join.orderBy?.find(
                    (item) => item.column === name
                  );
                  const sort = (direction: "asc" | "desc") =>
                    joinActions(join.joinAlias).orderBy(
                      [{ column: name, direction }],
                      { clearAllExistingOrders: true }
                    );
                  const SortIcon =
                    order?.direction === "asc"
                      ? ArrowUp
                      : order
                      ? ArrowDown
                      : ArrowUpDown;
                  return (
                    <th
                      key={`${join.joinAlias}:${name}`}
                      scope="col"
                      aria-sort={
                        order
                          ? order.direction === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                      className={classNames(
                        "h-9 border-b border-slate-200 bg-white px-2 font-medium text-slate-500",
                        columnIndex === 0 && joinIndex > 0 && "border-l-2"
                      )}
                      onMouseEnter={() =>
                        onChangeHighlightedJoinAlias(join.joinAlias)
                      }
                    >
                      <div className="flex min-w-0 items-center gap-1">
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-left hover:text-teal-700 focus-visible:outline-teal-600"
                          aria-label={`Sort by ${readableName}`}
                          onClick={() =>
                            sort(order?.direction === "asc" ? "desc" : "asc")
                          }
                        >
                          <span
                            className="min-w-0 max-w-[200px] truncate"
                            title={readableName}
                          >
                            {readableName}
                          </span>
                          <SortIcon
                            className={classNames(
                              "size-3 shrink-0",
                              order ? "text-teal-600" : "text-slate-400"
                            )}
                          />
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              aria-label={`Options for ${readableName}`}
                              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-teal-600"
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
                                visibleJoins[joinIndex]!.columns.length === 1
                              }
                              onSelect={() =>
                                joinActions(join.joinAlias).setSelectedColumns(
                                  visibleJoins[joinIndex]!.columns.filter(
                                    (column) => column.name !== name
                                  ).map((column) => column.name)
                                )
                              }
                            >
                              <EyeOff />
                              Hide column
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </th>
                  );
                }
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} style={{ height: ROW_HEIGHT }}>
                {columns.map(
                  ({ join, joinIndex, columnIndex, name, readableName }) => {
                    const rowSpan = rowSpans[joinIndex]![rowIndex]!;
                    if (rowSpan === 0) return null;
                    const cell = row
                      .find((cells) => cells[0]?.joinAlias === join.joinAlias)
                      ?.find((candidate) => candidate.rawField === name);
                    const id = `${rowIndex}:${join.joinAlias}:${name}`;
                    const text = cell?.readableValue ?? "";
                    const tableName = splitTableRef(join.tableRef)[1];
                    const label = `${tableName}, ${readableName}: ${text}`;
                    // Keep the single value visible beneath both header rows
                    // while scrolling through a tall merged record.
                    const content = (
                      <span
                        style={{ top: ROW_HEIGHT * 2, height: ROW_HEIGHT - 1 }}
                        className="sticky flex shrink-0 items-center gap-2"
                      >
                        <span
                          className={classNames(
                            "min-w-0 max-w-[200px] flex-1 truncate",
                            cell?.type === "number" && "tabular-nums",
                            cell?.rawValue == null && "italic text-slate-400"
                          )}
                        >
                          {text}
                        </span>
                        {cell?.foreignKey && cell.rawValue != null && (
                          <Link className="size-3 shrink-0 text-teal-600" />
                        )}
                      </span>
                    );
                    return (
                      <td
                        key={`${join.joinAlias}:${name}`}
                        rowSpan={rowSpan}
                        className={classNames(
                          "border-b border-slate-200 bg-white p-0 align-middle",
                          columnIndex === 0 &&
                            joinIndex > 0 &&
                            "border-l-2 border-l-slate-200"
                        )}
                        onMouseEnter={() =>
                          onChangeHighlightedJoinAlias(join.joinAlias)
                        }
                      >
                        {cell?.foreignKey && cell.rawValue != null ? (
                          <button
                            type="button"
                            aria-label={`Follow relationship from ${label}`}
                            title={text}
                            style={{ height: rowSpan * ROW_HEIGHT - 1 }}
                            className="flex w-full min-w-[140px] flex-col px-3 text-left hover:bg-slate-50 focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-teal-600"
                            onClick={() =>
                              joinActions(join.joinAlias).addJoinOnForeignKey(
                                name,
                                cell.rawValue.toString()
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
                                className="flex w-full min-w-[140px] flex-col px-3 text-left hover:bg-slate-50 focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-teal-600"
                              >
                                <PopoverAnchor asChild>{content}</PopoverAnchor>
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              align="start"
                              className="w-80 max-w-[calc(100vw-2rem)] space-y-3 border-slate-200 p-3 shadow-none"
                            >
                              <div className="text-[11px] font-medium text-slate-500">
                                {tableName} · {readableName}
                              </div>
                              <div className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-sm text-slate-800">
                                {text || (
                                  <span className="italic text-slate-400">
                                    Empty value
                                  </span>
                                )}
                              </div>
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
                            </PopoverContent>
                          </Popover>
                        )}
                      </td>
                    );
                  }
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

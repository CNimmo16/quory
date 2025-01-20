import { ActionIcon, Tooltip } from "@mantine/core";
import {
  ConditionOperator,
  isBooleanCondition,
  splitTableRef,
} from "@quory/core";
import { useQuery } from "@quory/stack/react";
import { createElement, memo, useEffect, useRef, useState } from "react";
import { AiOutlineEyeInvisible, AiOutlineLink } from "react-icons/ai";
import {
  TbArrowsSort,
  TbFilter,
  TbSortAscending,
  TbSortDescending,
} from "react-icons/tb";
import classNames from "classnames";
import { useClickOutside } from "@mantine/hooks";

type UseQueryRet = ReturnType<typeof useQuery>;
type QueryData = NonNullable<UseQueryRet["data"]>;

export default memo(DataTable);

function DataTable({
  width,
  height,
  highlightedJoinAlias,
  onChangeHighlightedJoinAlias,
  rows,
  visibleJoins,
  joinActions,
}: {
  width: number;
  height: number;
  highlightedJoinAlias: string | null;
  onChangeHighlightedJoinAlias: (joinAlias: string | null) => void;
  rows: QueryData["rows"];
  visibleJoins: QueryData["visibleJoins"];
  joinActions: UseQueryRet["joinActions"];
}) {
  const theadRef = useRef<HTMLTableSectionElement>(null);

  const [tbody, setTbody] = useState<HTMLTableSectionElement | null>(null);

  const [colWidths, setColWidths] = useState<(number | null)[]>([]);
  useEffect(() => {
    if (rows[0]) {
      setColWidths(
        visibleJoins.flatMap((join) => join.columns.map(() => null))
      );
    }
  }, [rows, visibleJoins]);
  useEffect(() => {
    if (tbody && visibleJoins && colWidths[0] === null) {
      setColWidths(
        visibleJoins.flatMap((join, joinIndex) =>
          join.columns.map((maybeColumn, colIndex) => {
            let maxLengthRowIndex;
            if (maybeColumn) {
              const [index, _maxLength] = rows.reduce(
                ([accIndex, accLength], row, rowIndex) => {
                  const val = row[joinIndex]![colIndex]!.readableValue ?? "";
                  return val.length > accLength
                    ? [rowIndex, val.length]
                    : [accIndex, accLength];
                },
                [-1, 0]
              );
              maxLengthRowIndex = index;
            } else {
              // references cell - all same width
              maxLengthRowIndex = 0;
            }
            const flatColIndex =
              visibleJoins
                .slice(0, joinIndex)
                .reduce((acc, { columns }) => acc + columns.length, 0) +
              colIndex;
            const maxLengthCell = tbody!.querySelector(
              `tr:nth-child(${maxLengthRowIndex + 1}) td:nth-child(${
                flatColIndex + 1
              })`
            );
            const headerCell = theadRef.current!.querySelector(
              `tr:nth-child(2) th:nth-child(${flatColIndex + 1})`
            );
            if (!maxLengthCell) {
              throw new Error("No max length cell");
            }
            const widestCellWidth =
              maxLengthCell!.getBoundingClientRect().width;

            return Math.max(
              headerCell!.getBoundingClientRect().width,
              maybeColumn
                ? Math.min(widestCellWidth, 150)
                : widestCellWidth + 20
            );
          })
        )
      );
    }
  }, [colWidths, rows, tbody, visibleJoins]);

  const gridTemplateColumns = colWidths
    .map((px) => (px ? `${px}px` : "min-content"))
    .join(" ");

  const makeCellBorderClassNames = (
    joinAlias: string,
    isFirstInJoin: boolean,
    isLastInJoin: boolean
  ) => {
    const joinIndex = visibleJoins.findIndex(
      ({ join }) => join.joinAlias === joinAlias
    );
    return [
      highlightedJoinAlias === joinAlias
        ? "border-blue-500"
        : "border-slate-400",
      isFirstInJoin && {
        "border-l-2": joinIndex === 0,
        "border-l-[1px]": joinIndex > 0,
        "border-l-blue-500":
          highlightedJoinAlias === visibleJoins[joinIndex - 1]?.join.joinAlias,
      },
      isLastInJoin && {
        "border-r-2": joinIndex === visibleJoins.length - 1,
        "border-r-[1px]": joinIndex < visibleJoins.length - 1,
        "border-r-blue-500":
          highlightedJoinAlias === visibleJoins[joinIndex + 1]?.join.joinAlias,
      },
    ];
  };

  const [selectedCell, setSelectedCell] = useState<unknown | null>(null);

  const allTds = [...document.getElementsByTagName("td")];
  useClickOutside(() => setSelectedCell(null), null, allTds);

  return (
    <table
      cellPadding={10}
      style={{ width, height, marginLeft: 15, marginRight: 15 }}
      className={classNames("flex flex-col overflow-auto text-sm", {
        invisible: !colWidths[0],
      })}
    >
      <thead
        ref={theadRef}
        className="sticky top-0 z-20 block text-left"
        onMouseLeave={() => onChangeHighlightedJoinAlias(null)}
      >
        <tr className="grid" style={{ gridTemplateColumns }}>
          {visibleJoins.map(({ join, columns }) => (
            <th
              className={classNames(
                "flex items-center justify-center gap-0 border-t-2 bg-slate-100",
                ...makeCellBorderClassNames(join.joinAlias, true, true)
              )}
              key={join.joinAlias}
              style={{
                gridColumn: `span ${columns.length}`,
              }}
              onMouseOver={() => onChangeHighlightedJoinAlias(join.joinAlias)}
            >
              <span className="mr-1">{splitTableRef(join.tableRef)[1]}</span>
            </th>
          ))}
        </tr>
        <tr className="grid" style={{ gridTemplateColumns }}>
          {visibleJoins.flatMap(({ join, columns }) =>
            columns.map((column, colIndexInJoin) => {
              const isLastVisibleFromTable = columns.length === 1;
              const existingOrderBy = join.orderBy?.find(
                (order) => order.column === column.name
              );
              return (
                <th
                  className={classNames(
                    "flex items-center bg-slate-100 py-0",
                    makeCellBorderClassNames(
                      join.joinAlias,
                      colIndexInJoin === 0,
                      colIndexInJoin === columns.length - 1
                    )
                  )}
                  key={`${join.joinAlias}-${column.name}`}
                  onMouseOver={() =>
                    onChangeHighlightedJoinAlias(join.joinAlias)
                  }
                >
                  <span className="mr-2">{column.readableName}</span>
                  <span className="flex flex-col -space-y-2">
                    <Tooltip
                      label={(() => {
                        if (isLastVisibleFromTable) {
                          return "Cannot hide all columns from table. Try removing the table instead.";
                        }
                        return "Hide column";
                      })()}
                    >
                      <ActionIcon
                        variant="transparent"
                        className="group"
                        disabled={isLastVisibleFromTable}
                        onClick={() =>
                          joinActions(join.joinAlias).setSelectedColumns(
                            columns
                              .filter((col) => col.name !== column.name)
                              .map((col) => col.name)
                          )
                        }
                      >
                        <AiOutlineEyeInvisible
                          size={18}
                          className="text-slate-800 group-hover:text-blue-500 group-disabled:!text-neutral-500"
                        />
                      </ActionIcon>
                    </Tooltip>
                    <ActionIcon
                      variant="transparent"
                      className="group"
                      onClick={() => {
                        joinActions(join.joinAlias).orderBy(
                          [
                            {
                              column: column.name,
                              direction:
                                existingOrderBy?.direction === "asc"
                                  ? "desc"
                                  : "asc",
                            },
                          ],
                          {
                            clearAllExistingOrders: true,
                          }
                        );
                      }}
                    >
                      {!existingOrderBy && (
                        <TbArrowsSort
                          size={18}
                          className="text-slate-800 group-hover:text-blue-500 group-disabled:!text-neutral-500"
                        />
                      )}
                      {existingOrderBy?.direction === "asc" && (
                        <TbSortAscending
                          size={18}
                          className="text-slate-800 group-hover:text-blue-500 group-disabled:!text-neutral-500"
                        />
                      )}
                      {existingOrderBy?.direction === "desc" && (
                        <TbSortDescending
                          size={18}
                          className="text-slate-800 group-hover:text-blue-500 group-disabled:!text-neutral-500"
                        />
                      )}
                    </ActionIcon>
                  </span>
                </th>
              );
            })
          )}
        </tr>
      </thead>
      <tbody
        className="w-fit grow bg-white shadow-[0_2px_0_2px_#94a3b8_inset]"
        ref={setTbody}
        onMouseLeave={() => {
          onChangeHighlightedJoinAlias(null);
        }}
      >
        {rows.map((joinsInRow, rowIndex) => (
          <tr
            style={{ gridTemplateColumns }}
            className={classNames("grid h-[32px]")}
            key={joinsInRow
              .flat()
              .filter((cell) => cell.isPrimary)
              .map((cell) => cell.rawValue)
              .join("")}
          >
            {joinsInRow.map((cells, joinIndex) => {
              const { join } = visibleJoins[joinIndex]!;
              return cells
                .filter((cell) =>
                  // filter out hidden columns
                  visibleJoins[joinIndex]!.columns.some(
                    (col) => col.name === cell.rawField
                  )
                )
                .map((cell, cellIndex, arr) => {
                  const cellText = cell.readableValue ?? "";
                  const cellIndexInRow =
                    joinsInRow
                      .slice(0, joinIndex)
                      .reduce((acc, _cells) => acc + _cells.length, 0) +
                    cellIndex;
                  const cellWidth = colWidths[cellIndexInRow]!;
                  const maxTextLength =
                    selectedCell === cell ? Infinity : cellWidth / 10;
                  const id = `${join.joinAlias}-${rowIndex}-${cell.rawField}`;
                  return (
                    <td
                      key={`${join.joinAlias}-${cell.rawField}`}
                      id={id}
                      className={classNames(
                        "block cursor-default p-0",
                        rowIndex % 2 === 1 ? "bg-slate-100" : "bg-white",
                        makeCellBorderClassNames(
                          join.joinAlias,
                          cellIndex === 0,
                          cellIndex === arr.length - 1
                        )
                      )}
                      onMouseOver={() =>
                        onChangeHighlightedJoinAlias(join.joinAlias)
                      }
                    >
                      {createElement(
                        cell.foreignKey && cellText ? "button" : "span",
                        {
                          className: classNames(
                            "w-full flex h-full items-center group whitespace-nowrap truncate",
                            {
                              "select-none": selectedCell !== cell,
                              "bg-slate-100 z-10 relative !overflow-visible":
                                selectedCell === cell,
                            }
                          ),
                          onClick: cell.foreignKey
                            ? () =>
                                joinActions(join.joinAlias).addJoinOnForeignKey(
                                  cell.rawField,
                                  cell.rawValue.toString()
                                )
                            : () => {
                                setSelectedCell(cell);
                              },
                        },
                        <>
                          {cell.foreignKey && cellText && (
                            <AiOutlineLink
                              size={20}
                              color="black"
                              className="ml-2"
                            />
                          )}
                          <span
                            className={classNames(
                              "flex h-full w-auto grow items-center justify-between pl-2 pr-0",
                              {
                                "border-[1px] border-slate-400 bg-slate-100":
                                  selectedCell === cell,
                              }
                            )}
                          >
                            {cellText.length > maxTextLength
                              ? `${cellText.slice(0, maxTextLength)}...`
                              : cellText}
                            {selectedCell === cell && (
                              <Tooltip label="Filter on this cell value">
                                <ActionIcon
                                  variant="transparent"
                                  className="group/filter-icon ml-1"
                                  onClick={() => {
                                    const existingCondition = join.where ?? {
                                      operator: ConditionOperator.AND,
                                      conditions: [],
                                    };
                                    if (
                                      !isBooleanCondition(existingCondition)
                                    ) {
                                      throw new Error(
                                        "Expected boolean condition"
                                      );
                                    }
                                    joinActions(join.joinAlias).setCondition({
                                      ...existingCondition,
                                      conditions: [
                                        ...existingCondition.conditions,
                                        {
                                          column: cell.rawField,
                                          operator: ConditionOperator.EQUALS,
                                          value: cellText,
                                        },
                                      ],
                                    });
                                    setSelectedCell(null);
                                  }}
                                >
                                  <TbFilter
                                    size={18}
                                    className="text-slate-800 group-hover/filter-icon:text-blue-500 group-disabled/filter-icon:!text-neutral-500"
                                  />
                                </ActionIcon>
                              </Tooltip>
                            )}
                          </span>
                        </>
                      )}
                    </td>
                  );
                });
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

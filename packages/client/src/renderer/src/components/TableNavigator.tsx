import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Hint } from "./Hint";
import {
  Condition,
  ConditionOperator,
  findTableFromSchemas,
  isBooleanCondition,
  isConditionComplete,
  isListCondition,
  PreparedJoinDef,
  PreparedQuery,
  splitTableRef,
} from "@quory/core";
import { hierarchy as makeHierarchy, tree as treeBuilder } from "d3-hierarchy";
import { useQuery, useFetchSchema } from "@quory/stack/react";
import {
  CSSProperties,
  Fragment,
  memo,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import ConditionEditor from "./ConditionEditor";
import { AiOutlineEdit, AiOutlinePlus } from "react-icons/ai";
import { TbCheck, TbTrash } from "react-icons/tb";
import { PiTreeStructure } from "react-icons/pi";
import classNames from "classnames";
import { BiColumns } from "react-icons/bi";
import JoinAnotherTableButton from "./JoinAnotherTableButton";

type UseQueryRet = ReturnType<typeof useQuery>;

const NEW_BUTTON_JOIN_ALIAS = "NEW_BUTTON";

export default memo(TableNavigator);

function TableNavigator({
  padding,
  width,
  joinActions,
  query,
  onHeightChange,
  schemas,
  highlightedJoinAlias,
  onChangeHighlightedJoinAlias,
  onDeleteQuery,
}: {
  padding: number;
  width: number;
  joinActions: UseQueryRet["joinActions"];
  query: PreparedQuery;
  onHeightChange: (height: number) => void;
  schemas: NonNullable<ReturnType<typeof useFetchSchema>["data"]>["schemas"];
  highlightedJoinAlias: string | null;
  onChangeHighlightedJoinAlias: (joinAlias: string | null) => void;
  onDeleteQuery: () => void;
}) {
  const nodeHeight = 100;
  const nodeWidth = 300;
  const nodeVisibleWidth = 300 - 40;

  const [tree, descendants, height, minimumXValue] = useMemo(() => {
    if (!query) {
      return [null, null, 0];
    }

    const hierarchy = makeHierarchy(
      (function addNewNodeButton(join: PreparedJoinDef): PreparedJoinDef {
        return {
          ...join,
          joins: [
            ...join.joins.map(addNewNodeButton),
            join.select.length >= 1 && {
              joinAlias: NEW_BUTTON_JOIN_ALIAS,
              joins: [],
              select: [],
              tableRef: "",
            },
          ].filter((x): x is PreparedJoinDef => Boolean(x)),
        };
      })(query.base),
      (d) => d.joins
    );
    const makeTree = treeBuilder<PreparedJoinDef>()
      .nodeSize([nodeHeight, nodeWidth])
      .separation((a, b) => (a.parent === b.parent ? 1 : 1.2));
    const _tree = makeTree(hierarchy);
    const _descendants = _tree.descendants();
    const xVals = _descendants.map((node) => node.x);
    const minX = Math.min(...xVals);
    const maxX = Math.max(...xVals);
    const _treeHeight = maxX - minX + nodeHeight;
    return [_tree, _descendants, _treeHeight, minX];
  }, [query, nodeWidth, nodeHeight]);

  useEffect(() => {
    onHeightChange(height);
  }, [onHeightChange, height]);

  const getNodeRealPosition = (node: { x: number; y: number }) => ({
    x: node.y,
    y: node.x - (minimumXValue ?? 0),
  });

  const [columnDropdownOpenForJoinAlias, setColumnDropdownOpenForJoinAlias] =
    useState<string | null>(null);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);

  const [
    conditionDropdownOpenForJoinAlias,
    setConditionDropdownOpenForJoinAlias,
  ] = useState<string | null>(null);
  const [condition, setCondition] = useState<Condition | null>(null);
  const handleConditionChange = useCallback((_condition: Condition) => {
    if (!isBooleanCondition(_condition)) {
      throw new Error("Expected boolean condition");
    }
    setCondition(_condition);
  }, []);

  if (!tree) {
    return null;
  }

  return (
    <div style={{ padding }}>
      <div className="relative" style={{ height }}>
        <svg width={width} height={height}>
          {descendants.map((node) => {
            if (!node.parent) {
              return null;
            }
            const position = getNodeRealPosition(node);
            const parentPosition = getNodeRealPosition(node.parent);
            // get center positions
            position.y += nodeHeight / 2;
            parentPosition.y += nodeHeight / 2;
            // get end position for parent
            parentPosition.x += nodeVisibleWidth;
            return (
              <polyline
                key={
                  node.data.joinAlias === NEW_BUTTON_JOIN_ALIAS
                    ? `new-button-${node.parent.data.joinAlias}`
                    : node.data.joinAlias
                }
                points={[
                  [parentPosition.x, parentPosition.y],
                  [
                    parentPosition.x + (position.x - parentPosition.x) / 2,
                    parentPosition.y,
                  ],
                  [
                    parentPosition.x + (position.x - parentPosition.x) / 2,
                    position.y,
                  ],
                  [position.x, position.y],
                ]
                  .map(([x, y]) => [x, y])
                  .join(" ")}
                className="stroke-slate-400"
                strokeWidth={2}
                fill="none"
              />
            );
          })}
        </svg>
        {descendants.map((node) => {
          const join = node.data;
          const position = getNodeRealPosition(node);
          const positionStyle: CSSProperties = {
            left: position.x,
            top: position.y,
            height: nodeHeight,
            width: nodeVisibleWidth,
          };
          const parentNode = node.parent;
          if (join.joinAlias === NEW_BUTTON_JOIN_ALIAS) {
            if (!parentNode) {
              throw new Error("No parent join");
            }
            return (
              <JoinAnotherTableButton
                key={`new-button-${parentNode.data.joinAlias}`}
                joinActions={joinActions}
                schemas={schemas}
                parentNode={parentNode}
                positionStyle={positionStyle}
              />
            );
          }
          const [schemaName, tableName] = splitTableRef(join.tableRef);
          const table = findTableFromSchemas(schemas, schemaName, tableName);
          const visibleColumns = joinActions(
            join.joinAlias
          ).getVisibleColumns();
          const isGhost = visibleColumns.length === 0;
          const isGhostButton = isGhost && !join.where;
          const showColumns = () =>
            joinActions(join.joinAlias).setSelectedColumns(
              table.columns.map((column) => column.name)
            );
          return (
            <Hint
              content="Click to show columns"
              disabled={!isGhostButton}
              key={join.joinAlias}
            >
              <div
                className={classNames(
                  "absolute flex flex-col justify-around gap-3 border-2 p-3",
                  highlightedJoinAlias === join.joinAlias && !isGhost
                    ? "border-blue-500"
                    : "border-slate-400",
                  isGhost && highlightedJoinAlias !== join.joinAlias
                    ? "bg-slate-200"
                    : "bg-slate-100",
                  {
                    "border-dashed": isGhost,
                    "cursor-pointer": isGhostButton,
                  }
                )}
                style={positionStyle}
                role={isGhostButton ? "button" : undefined}
                tabIndex={isGhostButton ? 0 : undefined}
                onKeyDown={(event) => {
                  if (
                    isGhostButton &&
                    (event.key === "Enter" || event.key === " ")
                  ) {
                    event.preventDefault();
                    showColumns();
                  }
                }}
                onMouseOver={() => onChangeHighlightedJoinAlias(join.joinAlias)}
                onMouseOut={() => onChangeHighlightedJoinAlias(null)}
                onClick={() => {
                  if (isGhostButton) showColumns();
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    {isGhost && join.where ? (
                      <Hint content="Click to show columns">
                        <button
                          type="button"
                          aria-label={`Show columns for ${tableName}`}
                          className="w-fit rounded-sm text-left text-slate-500 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          onClick={showColumns}
                        >
                          {tableName}
                        </button>
                      </Hint>
                    ) : (
                      <div
                        className={classNames({
                          "text-slate-500": isGhost,
                        })}
                      >
                        {tableName}
                      </div>
                    )}
                    {(!isGhost || join.where) && (
                      <Popover
                        open={
                          conditionDropdownOpenForJoinAlias === join.joinAlias
                        }
                        onOpenChange={(visible) => {
                          if (visible) {
                            setCondition(
                              join.where && !isBooleanCondition(join.where)
                                ? {
                                    operator: ConditionOperator.AND,
                                    conditions: [join.where],
                                  }
                                : join.where ?? null
                            );
                            setConditionDropdownOpenForJoinAlias(
                              join.joinAlias
                            );
                          } else {
                            setCondition(null);
                            setConditionDropdownOpenForJoinAlias(null);
                          }
                        }}
                      >
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="group flex w-fit max-w-full items-center gap-2 rounded-full bg-slate-300 pl-2 pr-1 text-left transition-all hover:bg-slate-200"
                          >
                            <span className="min-w-0 break-words">
                              {join.where ? (
                                (function renderCondition(
                                  cond: Condition
                                ): ReactNode {
                                  if (isBooleanCondition(cond)) {
                                    return (
                                      <span>
                                        {cond.conditions.map((child, i) => (
                                          <Fragment key={i}>
                                            {renderCondition(child)}
                                            {i < cond.conditions.length - 1 && (
                                              <span className="text-sm text-slate-900">
                                                {" "}
                                                {cond.operator.toUpperCase()}{" "}
                                              </span>
                                            )}
                                          </Fragment>
                                        ))}
                                      </span>
                                    );
                                  }
                                  return (
                                    <span className="text-sm text-slate-900">{`${
                                      cond.column
                                    } ${cond.operator} ${
                                      isListCondition(cond)
                                        ? `(${cond.values.join(", ")})`
                                        : `"${cond.value}"`
                                    }`}</span>
                                  );
                                })(join.where)
                              ) : (
                                <span className="text-sm text-slate-900">
                                  Add filter
                                </span>
                              )}
                            </span>
                            <div
                              className={
                                "my-[1px] shrink-0 rounded-full p-1 transition-all group-hover:bg-slate-500"
                              }
                            >
                              {join.where ? (
                                <AiOutlineEdit
                                  size={14}
                                  className="text-slate-700 transition-all group-hover:text-white"
                                />
                              ) : (
                                <AiOutlinePlus
                                  size={14}
                                  className="text-slate-700 transition-all group-hover:text-white"
                                />
                              )}
                            </div>
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="flex max-h-[var(--radix-popover-content-available-height)] w-[650px] max-w-[calc(100vw-2rem)] flex-col gap-3 overflow-auto"
                        >
                          <ConditionEditor
                            columns={table.columns}
                            condition={
                              condition ?? {
                                operator: ConditionOperator.AND,
                                conditions: [
                                  {
                                    column: table.columns[0]?.name ?? "",
                                    operator: ConditionOperator.EQUALS,
                                    value: "",
                                  },
                                ],
                              }
                            }
                            maxDropdownHeight={700}
                            onConditionChange={handleConditionChange}
                            onDelete={() =>
                              joinActions(join.joinAlias).removeCondition()
                            }
                          />
                          <div className="flex gap-2">
                            <Button
                              variant="secondary"
                              className="grow"
                              onClick={() => {
                                setConditionDropdownOpenForJoinAlias(null);
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              disabled={!condition}
                              className="grow"
                              onClick={() => {
                                if (
                                  !condition ||
                                  !isBooleanCondition(condition)
                                ) {
                                  throw new Error(
                                    `Invalid condition, expected a boolean condition, received ${JSON.stringify(
                                      condition
                                    )}`
                                  );
                                }
                                const conditions =
                                  condition.conditions.filter(
                                    isConditionComplete
                                  );
                                if (conditions.length) {
                                  joinActions(join.joinAlias).setCondition({
                                    ...condition,
                                    conditions,
                                  });
                                } else {
                                  joinActions(join.joinAlias).removeCondition();
                                }
                                setConditionDropdownOpenForJoinAlias(null);
                              }}
                            >
                              Apply
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                  {!isGhost && (
                    <div
                      className="grid grid-cols-2 gap-2"
                      style={{ direction: "rtl" }}
                    >
                      <DropdownMenu
                        open={columnDropdownOpenForJoinAlias === join.joinAlias}
                        onOpenChange={(visible) => {
                          if (visible) {
                            setColumnDropdownOpenForJoinAlias(join.joinAlias);
                            setSelectedColumns(visibleColumns);
                          } else {
                            setColumnDropdownOpenForJoinAlias(null);
                          }
                        }}
                      >
                        <Hint content="Edit displayed columns">
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="secondary"
                              size="icon"
                              className="size-7"
                              aria-label={`Edit displayed columns for ${tableName}`}
                            >
                              <BiColumns />
                            </Button>
                          </DropdownMenuTrigger>
                        </Hint>
                        <DropdownMenuContent
                          align="end"
                          className="max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-48 overflow-auto"
                        >
                          <DropdownMenuCheckboxItem
                            checked={
                              selectedColumns.length === table.columns.length
                                ? true
                                : selectedColumns.length > 0
                                ? "indeterminate"
                                : false
                            }
                            onSelect={(event) => event.preventDefault()}
                            onCheckedChange={() => {
                              setSelectedColumns(
                                selectedColumns.length === table.columns.length
                                  ? [table.columns[0]!.name]
                                  : table.columns.map((column) => column.name)
                              );
                            }}
                          >
                            Select all
                          </DropdownMenuCheckboxItem>
                          <DropdownMenuSeparator />
                          {table.columns.map((column) => {
                            const disabled =
                              selectedColumns.includes(column.name) &&
                              selectedColumns.length === 1;
                            return (
                              <Hint
                                key={column.name}
                                disabled={!disabled}
                                content="Cannot hide all columns from table. Try removing the table instead."
                                side="right"
                              >
                                <DropdownMenuCheckboxItem
                                  checked={selectedColumns.includes(
                                    column.name
                                  )}
                                  aria-disabled={disabled}
                                  className={
                                    disabled
                                      ? "cursor-not-allowed text-muted-foreground"
                                      : undefined
                                  }
                                  onSelect={(event) => event.preventDefault()}
                                  onCheckedChange={(checked) => {
                                    if (disabled) return;
                                    setSelectedColumns(
                                      checked
                                        ? [...selectedColumns, column.name]
                                        : selectedColumns.filter(
                                            (name) => name !== column.name
                                          )
                                    );
                                  }}
                                >
                                  {column.name}
                                </DropdownMenuCheckboxItem>
                              </Hint>
                            );
                          })}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            asChild
                            onSelect={() => {
                              joinActions(join.joinAlias).setSelectedColumns(
                                selectedColumns
                              );
                              setColumnDropdownOpenForJoinAlias(null);
                            }}
                          >
                            <Button
                              type="button"
                              variant="secondary"
                              className="w-full"
                            >
                              Apply <TbCheck />
                            </Button>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {parentNode && (
                        <Popover>
                          <Hint content="Edit join path">
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="secondary"
                                size="icon"
                                className="size-7"
                                aria-label={`Edit join path for ${tableName}`}
                              >
                                <PiTreeStructure />
                              </Button>
                            </PopoverTrigger>
                          </Hint>
                          <PopoverContent className="bg-slate-900/90 px-2 text-sm text-white">
                            Coming soon! See the roadmap on Github.
                          </PopoverContent>
                        </Popover>
                      )}
                      {parentNode && (
                        <Hint content="Remove table from query">
                          <Button
                            type="button"
                            variant="secondary"
                            size="icon"
                            className="row-start-2 size-7 bg-red-100 text-red-600 hover:bg-red-200"
                            aria-label={`Remove ${tableName} from query`}
                            onClick={() => {
                              if (joinActions(join.joinAlias).getParent()) {
                                joinActions(join.joinAlias).removeJoin();
                              } else if (onDeleteQuery) {
                                onDeleteQuery();
                              }
                            }}
                          >
                            <TbTrash />
                          </Button>
                        </Hint>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Hint>
          );
        })}
      </div>
    </div>
  );
}

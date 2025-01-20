import {
  ActionIcon,
  Button,
  Checkbox,
  Menu,
  Popover,
  Tooltip,
} from "@mantine/core";
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
  const handleConditionChange = useCallback(
    (_condition: Condition) => {
      if (!isBooleanCondition(_condition)) {
        throw new Error("Expected boolean condition");
      }
      if (_condition.conditions.filter(isConditionComplete).length === 0) {
        setCondition(null);
        setConditionDropdownOpenForJoinAlias(null);
        joinActions(conditionDropdownOpenForJoinAlias!).removeCondition();
      } else {
        setCondition(_condition);
      }
    },
    [conditionDropdownOpenForJoinAlias, joinActions]
  );

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
          return (
            <Tooltip
              label="Click to add to query"
              disabled={!isGhost}
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
                    "cursor-pointer border-dashed": isGhost,
                  }
                )}
                style={positionStyle}
                onMouseOver={() => onChangeHighlightedJoinAlias(join.joinAlias)}
                onMouseOut={() => onChangeHighlightedJoinAlias(null)}
                onClick={() => {
                  if (isGhost) {
                    joinActions(join.joinAlias).setSelectedColumns(
                      table.columns.map((c) => c.name)
                    );
                  }
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <div
                      className={classNames({
                        "text-slate-500": isGhost,
                      })}
                    >
                      {tableName}
                    </div>
                    {!isGhost && (
                      <Popover
                        opened={
                          conditionDropdownOpenForJoinAlias === join.joinAlias
                        }
                        onChange={(visible) => {
                          if (visible) {
                            setCondition(join.where ?? null);
                            setConditionDropdownOpenForJoinAlias(
                              join.joinAlias
                            );
                          } else {
                            setCondition(null);
                            setConditionDropdownOpenForJoinAlias(null);
                          }
                        }}
                      >
                        <Popover.Target>
                          <button
                            className="group flex w-fit items-center gap-2 rounded-full bg-slate-300 pl-2 pr-1 transition-all hover:bg-slate-200"
                            onClick={() => {
                              setCondition(join.where ?? null);
                              setConditionDropdownOpenForJoinAlias(
                                join.joinAlias
                              );
                            }}
                          >
                            <span>
                              {join.where ? (
                                (function renderCondition(
                                  cond: Condition
                                ): ReactNode {
                                  if (isBooleanCondition(cond)) {
                                    return (
                                      <span>
                                        {cond.conditions.flatMap((child, i) => {
                                          const rendered =
                                            renderCondition(child);
                                          return [
                                            rendered,
                                            i < cond.conditions.length - 1 && (
                                              <span
                                                key={JSON.stringify(child)}
                                                className="text-sm text-slate-900"
                                              >
                                                {" "}
                                                {cond.operator.toUpperCase()}{" "}
                                              </span>
                                            ),
                                          ];
                                        })}
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
                                "my-[1px] rounded-full p-1 transition-all group-hover:bg-slate-500"
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
                        </Popover.Target>
                        <Popover.Dropdown className="flex flex-col gap-2">
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
                              variant="light"
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
                                joinActions(join.joinAlias).setCondition({
                                  ...condition,
                                  conditions:
                                    condition.conditions.filter(
                                      isConditionComplete
                                    ),
                                });
                                setConditionDropdownOpenForJoinAlias(null);
                              }}
                            >
                              Apply
                            </Button>
                          </div>
                        </Popover.Dropdown>
                      </Popover>
                    )}
                  </div>
                  {!isGhost && (
                    <div
                      className="grid grid-cols-2 gap-2"
                      style={{ direction: "rtl" }}
                    >
                      <Menu
                        opened={
                          columnDropdownOpenForJoinAlias === join.joinAlias
                        }
                        onChange={(visible) => {
                          if (visible) {
                            setColumnDropdownOpenForJoinAlias(join.joinAlias);
                            setSelectedColumns(visibleColumns);
                          } else {
                            setColumnDropdownOpenForJoinAlias(null);
                          }
                        }}
                        closeOnItemClick={false}
                      >
                        <Menu.Target>
                          <Tooltip label="Edit displayed columns">
                            <ActionIcon variant="light">
                              <BiColumns size={20} />
                            </ActionIcon>
                          </Tooltip>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item
                            leftSection={
                              <Checkbox
                                checked={
                                  selectedColumns.length ===
                                  table.columns.length
                                }
                                indeterminate={
                                  selectedColumns.length <
                                    table.columns.length &&
                                  selectedColumns.length > 0
                                }
                                readOnly
                              />
                            }
                            onClick={() => {
                              if (
                                selectedColumns.length === table.columns.length
                              ) {
                                setSelectedColumns([table.columns[0]!.name]);
                              } else {
                                setSelectedColumns(
                                  table.columns.map((c) => c.name)
                                );
                              }
                            }}
                          >
                            Select all
                          </Menu.Item>
                          <Menu.Divider />
                          {table.columns.map((column) => {
                            const disabled =
                              selectedColumns.includes(column.name) &&
                              selectedColumns.length === 1;
                            return (
                              <Tooltip
                                key={column.name}
                                disabled={!disabled}
                                label="Cannot hide all columns from table. Try removing the table instead."
                              >
                                <Menu.Item
                                  className={classNames({
                                    "cursor-not-allowed text-neutral-500":
                                      disabled,
                                  })}
                                  leftSection={
                                    <Checkbox
                                      checked={selectedColumns.includes(
                                        column.name
                                      )}
                                      readOnly
                                      disabled={disabled}
                                    />
                                  }
                                  onClick={() => {
                                    if (disabled) {
                                      return;
                                    }
                                    if (selectedColumns.includes(column.name)) {
                                      setSelectedColumns(
                                        selectedColumns.filter(
                                          (c) => c !== column.name
                                        )
                                      );
                                    } else {
                                      setSelectedColumns([
                                        ...selectedColumns,
                                        column.name,
                                      ]);
                                    }
                                  }}
                                >
                                  {column.name}
                                </Menu.Item>
                              </Tooltip>
                            );
                          })}
                          <Menu.Item className="p-0">
                            <Button
                              rightSection={<TbCheck size={20} />}
                              variant="light"
                              className="w-full"
                              onClick={() => {
                                joinActions(join.joinAlias).setSelectedColumns(
                                  selectedColumns
                                );
                                setColumnDropdownOpenForJoinAlias(null);
                              }}
                            >
                              Apply
                            </Button>
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                      {parentNode && (
                        <Menu>
                          <Menu.Target>
                            <Tooltip label="Edit join path">
                              <ActionIcon variant="light">
                                <PiTreeStructure size={20} />
                              </ActionIcon>
                            </Tooltip>
                          </Menu.Target>
                          <Menu.Dropdown className="bg-slate-900/90 px-2 text-sm text-white">
                            {/* TODO: add this functionality */}
                            Coming soon! See the roadmap on Github.
                          </Menu.Dropdown>
                        </Menu>
                      )}
                      {parentNode && (
                        <Tooltip label="Remove table from query">
                          <ActionIcon
                            variant="light"
                            className="row-start-2 !bg-red-100"
                            onClick={() => {
                              if (joinActions(join.joinAlias).getParent()) {
                                joinActions(join.joinAlias).removeJoin();
                              } else if (onDeleteQuery) {
                                onDeleteQuery();
                              }
                            }}
                          >
                            <TbTrash className="text-red-600" size={20} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

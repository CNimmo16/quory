import {
  ActionIcon,
  Alert,
  Button,
  Checkbox,
  Divider,
  Loader,
  LoadingOverlay,
  Menu,
  Popover,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  Condition,
  ConditionOperator,
  findTableFromSchemas,
  getRelationsForTable,
  isBooleanCondition,
  isConditionComplete,
  isListCondition,
  PreparedJoinDef,
  PreparedQuery,
  Query,
  splitTableRef,
} from "@quory/core";
import { hierarchy as makeHierarchy, tree as treeBuilder } from "d3-hierarchy";
import { useQuery, useFetchSchema } from "@quory/stack/react";
import {
  createElement,
  CSSProperties,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ConditionEditor from "./ConditionEditor";
import {
  AiOutlineEdit,
  AiOutlineEyeInvisible,
  AiOutlineLink,
  AiOutlinePlus,
} from "react-icons/ai";
import {
  TbArrowsSort,
  TbCheck,
  TbFilter,
  TbSearch,
  TbSortAscending,
  TbSortDescending,
  TbTablePlus,
  TbTrash,
  TbX,
} from "react-icons/tb";
import { PiTreeStructure } from "react-icons/pi";
import classNames from "classnames";
import { BiColumns } from "react-icons/bi";
import { useClickOutside, useDebouncedValue } from "@mantine/hooks";

const NEW_BUTTON_JOIN_ALIAS = "NEW_BUTTON";

export default function QueryView({
  initialQuery,
  onDeleteQuery,
  onQueryChange,
  onChangeDebounceDelaySeconds = 10,
  width: viewWidth,
  height: viewHeight,
}: {
  initialQuery: Query;
  onQueryChange: (query: PreparedQuery) => void;
  onDeleteQuery?: () => void;
  onChangeDebounceDelaySeconds?: number;
  width: number;
  height: number;
}) {
  const { data: schemaData } = useFetchSchema();

  const [_query, setQuery] = useState<Query>(initialQuery);

  const { query, data, error, isLoading, joinActions } = useQuery(
    _query,
    setQuery
  );

  const [debouncedQuery] = useDebouncedValue(
    query,
    onChangeDebounceDelaySeconds * 1000
  );
  useEffect(() => {
    if (!debouncedQuery) return;
    onQueryChange(debouncedQuery);
  }, [debouncedQuery, onQueryChange]);

  const theadRef = useRef<HTMLTableSectionElement>(null);

  const [tbody, setTbody] = useState<HTMLTableSectionElement | null>(null);

  const [colWidths, setColWidths] = useState<(number | null)[]>([]);
  useEffect(() => {
    if (data?.rows[0]) {
      setColWidths(
        data.visibleJoins.flatMap((join) => join.columns.map(() => null))
      );
    }
    if (!data) {
      setColWidths([]);
    }
  }, [data]);
  useEffect(() => {
    if (tbody && data && data.visibleJoins && colWidths[0] === null) {
      setColWidths(
        data.visibleJoins.flatMap((join, joinIndex) =>
          join.columns.map((maybeColumn, colIndex) => {
            let maxLengthRowIndex;
            if (maybeColumn) {
              const [index, _maxLength] = data.rows.reduce(
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
              data.visibleJoins
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
  }, [colWidths, tbody, data]);

  const gridTemplateColumns = colWidths
    .map((px) => (px ? `${px}px` : "min-content"))
    .join(" ");

  const graphNodeHeight = 100;
  const graphNodeWidth = 300;
  const graphNodeVisibleWidth = 300 - 40;

  const [tree, treeHeight, minimumXValue] = useMemo(() => {
    if (!query) {
      return [null, 0];
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
      .nodeSize([graphNodeHeight, graphNodeWidth])
      .separation((a, b) => (a.parent === b.parent ? 1 : 1.2));
    const _tree = makeTree(hierarchy);
    const xVals = _tree.descendants().map((node) => node.x);
    const minX = Math.min(...xVals);
    const maxX = Math.max(...xVals);
    const _treeHeight = maxX - minX + graphNodeHeight;
    return [_tree, _treeHeight, minX];
  }, [query, graphNodeWidth, graphNodeHeight]);

  const treePadding = 20;

  const tableHeight = useMemo(() => {
    if (!treeHeight) {
      return 300;
    }
    return viewHeight - treeHeight - treePadding;
  }, [viewHeight, treeHeight]);

  const getNodeRealPosition = (node: { x: number; y: number }) => ({
    x: node.y,
    y: node.x - (minimumXValue ?? 0),
  });

  const [highlightedJoinAlias, setHighlightedJoinAlias] = useState<
    string | null
  >(null);

  const makeHoverProps = useCallback(
    (joinAlias: string) => ({
      onMouseOver: () => setHighlightedJoinAlias(joinAlias),
    }),
    []
  );

  const [selectedCell, setSelectedCell] = useState<unknown | null>(null);

  const allTds = [...document.getElementsByTagName("td")];
  useClickOutside(() => setSelectedCell(null), null, allTds);

  const makeCellBorderClassNames = (
    joinAlias: string,
    isFirstInJoin: boolean,
    isLastInJoin: boolean
  ) => {
    if (!data) {
      return [];
    }
    const joinIndex = data.visibleJoins.findIndex(
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
          highlightedJoinAlias ===
          data.visibleJoins[joinIndex - 1]?.join.joinAlias,
      },
      isLastInJoin && {
        "border-r-2": joinIndex === data.visibleJoins.length - 1,
        "border-r-[1px]": joinIndex < data.visibleJoins.length - 1,
        "border-r-blue-500":
          highlightedJoinAlias ===
          data.visibleJoins[joinIndex + 1]?.join.joinAlias,
      },
    ];
  };

  const [otherTablesSearch, setOtherTablesSearch] = useState("");

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

  if (!schemaData) {
    return <LoadingOverlay />;
  }
  return (
    <div className="bg-slate-200">
      <div style={{ padding: treePadding }}>
        <div className="relative" style={{ height: treeHeight }}>
          {data && tree && (
            <>
              <svg width={viewWidth} height={treeHeight}>
                {tree.descendants().map((node) => {
                  if (!node.parent) {
                    return null;
                  }
                  const position = getNodeRealPosition(node);
                  const parentPosition = getNodeRealPosition(node.parent);
                  // get center positions
                  position.y += graphNodeHeight / 2;
                  parentPosition.y += graphNodeHeight / 2;
                  // get end position for parent
                  parentPosition.x += graphNodeVisibleWidth;
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
                          parentPosition.x +
                            (position.x - parentPosition.x) / 2,
                          parentPosition.y,
                        ],
                        [
                          parentPosition.x +
                            (position.x - parentPosition.x) / 2,
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
              {tree.descendants().map((node) => {
                const join = node.data;
                const position = getNodeRealPosition(node);
                const positionStyle: CSSProperties = {
                  left: position.x,
                  top: position.y,
                  height: graphNodeHeight,
                  width: graphNodeVisibleWidth,
                };
                const parentJoin = node.parent?.data;
                if (join.joinAlias === NEW_BUTTON_JOIN_ALIAS) {
                  if (!parentJoin) {
                    throw new Error("No parent join");
                  }
                  return (
                    <div
                      key={`new-button-${parentJoin.joinAlias}`}
                      style={positionStyle}
                      className="absolute flex items-center"
                    >
                      <Popover position="bottom" withArrow shadow="md">
                        <Popover.Target>
                          <Button
                            rightSection={<TbTablePlus size={20} />}
                            variant="light"
                          >
                            Join another table
                          </Button>
                        </Popover.Target>
                        <Popover.Dropdown className="h-[600px] !w-[400px] overflow-auto">
                          <div className="flex flex-col gap-[8px] pb-[8px] pt-[4px]">
                            <div className="text-sm text-slate-600">
                              Adjacent tables
                            </div>
                            {(() => {
                              const adjacentTables = findTableFromSchemas(
                                schemaData.schemas,
                                ...splitTableRef(parentJoin.tableRef)
                              ).columns.flatMap((column) => [
                                ...column.foreignKeys.map(
                                  (ref) =>
                                    [
                                      ref.foreignSchemaName,
                                      ref.foreignTableName,
                                    ] as const
                                ),
                                ...column.foreignKeyReferences.map(
                                  (ref) =>
                                    [
                                      ref.localSchemaName,
                                      ref.localTableName,
                                    ] as const
                                ),
                              ]);
                              const [parentSchema, parentTable] = splitTableRef(
                                parentJoin.tableRef
                              );
                              const otherTables = getRelationsForTable(
                                schemaData.schemas,
                                parentSchema,
                                parentTable
                              )
                                .filter(
                                  (table) =>
                                    !adjacentTables.some(
                                      ([schemaName, tableName]) =>
                                        schemaName === table.schemaName &&
                                        tableName === table.name
                                    )
                                )
                                .map(
                                  (table) =>
                                    [table.schemaName, table.name] as const
                                )
                                .filter(([schemaName, tableName]) =>
                                  `${schemaName}.${tableName}`.includes(
                                    otherTablesSearch
                                  )
                                );
                              return [
                                ...adjacentTables,
                                null,
                                ...otherTables,
                              ].map((maybeTableRef) => {
                                if (!maybeTableRef) {
                                  return (
                                    <div key="divider">
                                      <Divider />
                                      <TextInput
                                        className="mt-2"
                                        type="search"
                                        placeholder="Filter other tables"
                                        value={otherTablesSearch}
                                        onChange={(e) => {
                                          setOtherTablesSearch(e.target.value);
                                        }}
                                        leftSection={<TbSearch size={20} />}
                                        rightSection={
                                          otherTablesSearch && (
                                            <ActionIcon
                                              variant="transparent"
                                              onClick={() =>
                                                setOtherTablesSearch("")
                                              }
                                            >
                                              <TbX size={20} />
                                            </ActionIcon>
                                          )
                                        }
                                      />
                                    </div>
                                  );
                                }
                                const [tableSchema, tableName] = maybeTableRef;
                                const existingJoin = [
                                  ...node.parent!.ancestors(),
                                  ...node.parent!.descendants(),
                                ].find(
                                  (otherNode) =>
                                    otherNode.data.tableRef ===
                                    `${tableSchema}.${tableName}`
                                );
                                return (
                                  <div
                                    key={`${tableSchema}.${tableName}`}
                                    className="flex cursor-default items-start py-0"
                                  >
                                    <Tooltip
                                      label="Records already joined"
                                      disabled={!existingJoin}
                                      position="right"
                                    >
                                      <button
                                        className={classNames(
                                          "m-0 flex items-center gap-1 rounded-lg bg-slate-200 px-2 py-0 disabled:bg-neutral-200 disabled:text-neutral-600 [&:not(:disabled)]:hover:bg-slate-300"
                                        )}
                                        disabled={!!existingJoin}
                                        onClick={() =>
                                          joinActions(
                                            parentJoin.joinAlias
                                          ).addJoin(
                                            `${tableSchema}.${tableName}`
                                          )
                                        }
                                      >
                                        {existingJoin ? (
                                          <TbCheck
                                            size={16}
                                            className="text-slate-800"
                                          />
                                        ) : (
                                          <TbTablePlus
                                            size={16}
                                            className="text-slate-800"
                                          />
                                        )}
                                        {tableName}
                                      </button>
                                    </Tooltip>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        </Popover.Dropdown>
                      </Popover>
                    </div>
                  );
                }
                const [schemaName, tableName] = splitTableRef(join.tableRef);
                const table = findTableFromSchemas(
                  schemaData.schemas,
                  schemaName,
                  tableName
                );
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
                      {...makeHoverProps(join.joinAlias)}
                      onMouseOut={() => setHighlightedJoinAlias(null)}
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
                                conditionDropdownOpenForJoinAlias ===
                                join.joinAlias
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
                                              {cond.conditions.flatMap(
                                                (child, i) => {
                                                  const rendered =
                                                    renderCondition(child);
                                                  return [
                                                    rendered,
                                                    i <
                                                      cond.conditions.length -
                                                        1 && (
                                                      <span
                                                        key={JSON.stringify(
                                                          child
                                                        )}
                                                        className="text-sm text-slate-900"
                                                      >
                                                        {" "}
                                                        {cond.operator.toUpperCase()}{" "}
                                                      </span>
                                                    ),
                                                  ];
                                                }
                                              )}
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
                                    joinActions(
                                      join.joinAlias
                                    ).removeCondition()
                                  }
                                />
                                <div className="flex gap-2">
                                  <Button
                                    variant="light"
                                    className="grow"
                                    onClick={() => {
                                      setConditionDropdownOpenForJoinAlias(
                                        null
                                      );
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
                                      setConditionDropdownOpenForJoinAlias(
                                        null
                                      );
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
                                columnDropdownOpenForJoinAlias ===
                                join.joinAlias
                              }
                              onChange={(visible) => {
                                if (visible) {
                                  setColumnDropdownOpenForJoinAlias(
                                    join.joinAlias
                                  );
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
                                      selectedColumns.length ===
                                      table.columns.length
                                    ) {
                                      setSelectedColumns([]);
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
                                          if (
                                            selectedColumns.includes(
                                              column.name
                                            )
                                          ) {
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
                                      joinActions(
                                        join.joinAlias
                                      ).setSelectedColumns(selectedColumns);
                                      setColumnDropdownOpenForJoinAlias(null);
                                    }}
                                  >
                                    Apply
                                  </Button>
                                </Menu.Item>
                              </Menu.Dropdown>
                            </Menu>
                            {parentJoin && (
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
                            {(parentJoin || onDeleteQuery) && (
                              <Tooltip label="Remove table from query">
                                <ActionIcon
                                  variant="light"
                                  className="row-start-2 !bg-red-100"
                                  onClick={() => {
                                    if (
                                      joinActions(join.joinAlias).getParent()
                                    ) {
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
            </>
          )}
        </div>
      </div>
      <div>
        {error && (
          <Alert variant="default" className="mb-3 bg-red-100">
            {error.message}
          </Alert>
        )}
        {isLoading && (
          <div className="bg-white p-5">
            <Loader />
          </div>
        )}
        {query && data && !isLoading && (
          <>
            {data.rows[0] ? (
              <table
                cellPadding={10}
                style={{
                  width: viewWidth - 30,
                  height: tableHeight - 20,
                  marginLeft: 15,
                  marginRight: 15,
                }}
                className={classNames("flex flex-col overflow-auto text-sm", {
                  invisible: !colWidths[0],
                })}
              >
                <thead
                  ref={theadRef}
                  className="sticky top-0 z-20 block text-left"
                  onMouseLeave={() => setHighlightedJoinAlias(null)}
                >
                  <tr className="grid" style={{ gridTemplateColumns }}>
                    {data.visibleJoins.map(({ join, columns }) => (
                      <th
                        className={classNames(
                          "flex items-center justify-center gap-0 border-t-2 bg-slate-100",
                          ...makeCellBorderClassNames(
                            join.joinAlias,
                            true,
                            true
                          )
                        )}
                        key={join.joinAlias}
                        style={{
                          gridColumn: `span ${columns.length}`,
                        }}
                        {...makeHoverProps(join.joinAlias)}
                      >
                        <span className="mr-1">
                          {splitTableRef(join.tableRef)[1]}
                        </span>
                      </th>
                    ))}
                  </tr>
                  <tr className="grid" style={{ gridTemplateColumns }}>
                    {data.visibleJoins.flatMap(({ join, columns }) =>
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
                            {...makeHoverProps(join.joinAlias)}
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
                                    joinActions(
                                      join.joinAlias
                                    ).setSelectedColumns(
                                      columns
                                        .filter(
                                          (col) => col.name !== column.name
                                        )
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
                    setHighlightedJoinAlias(null);
                  }}
                >
                  {data.rows.map((joinsInRow, rowIndex) => (
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
                        const { join } = data.visibleJoins[joinIndex]!;
                        return cells
                          .filter((cell) =>
                            // filter out hidden columns
                            data.visibleJoins[joinIndex]!.columns.some(
                              (col) => col.name === cell.rawField
                            )
                          )
                          .map((cell, cellIndex, arr) => {
                            const cellText = cell.readableValue ?? "";
                            const cellIndexInRow =
                              joinsInRow
                                .slice(0, joinIndex)
                                .reduce(
                                  (acc, _cells) => acc + _cells.length,
                                  0
                                ) + cellIndex;
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
                                  rowIndex % 2 === 1
                                    ? "bg-slate-100"
                                    : "bg-white",
                                  makeCellBorderClassNames(
                                    join.joinAlias,
                                    cellIndex === 0,
                                    cellIndex === arr.length - 1
                                  )
                                )}
                                {...makeHoverProps(join.joinAlias)}
                              >
                                {createElement(
                                  cell.foreignKey && cellText
                                    ? "button"
                                    : "span",
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
                                          joinActions(
                                            join.joinAlias
                                          ).addJoinOnForeignKey(
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
                                        ? `${cellText.slice(
                                            0,
                                            maxTextLength
                                          )}...`
                                        : cellText}
                                      {selectedCell === cell && (
                                        <Tooltip label="Filter on this cell value">
                                          <ActionIcon
                                            variant="transparent"
                                            className="group/filter-icon ml-1"
                                            onClick={() => {
                                              const existingCondition =
                                                join.where ?? {
                                                  operator:
                                                    ConditionOperator.AND,
                                                  conditions: [],
                                                };
                                              if (
                                                !isBooleanCondition(
                                                  existingCondition
                                                )
                                              ) {
                                                throw new Error(
                                                  "Expected boolean condition"
                                                );
                                              }
                                              joinActions(
                                                join.joinAlias
                                              ).setCondition({
                                                ...existingCondition,
                                                conditions: [
                                                  ...existingCondition.conditions,
                                                  {
                                                    column: cell.rawField,
                                                    operator:
                                                      ConditionOperator.EQUALS,
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
            ) : (
              <div className="bg-white p-5">No records found</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

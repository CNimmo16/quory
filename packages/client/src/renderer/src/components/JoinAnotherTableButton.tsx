import {
  ActionIcon,
  Button,
  Divider,
  Popover,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  findTableFromSchemas,
  getRelationsForTable,
  PreparedJoinDef,
  splitTableRef,
} from "@quory/core";
import { ComponentProps, CSSProperties, memo, useMemo, useState } from "react";
import { TbCheck, TbSearch, TbTablePlus, TbX } from "react-icons/tb";
import classNames from "classnames";
import TableNavigator from "./TableNavigator";
import { HierarchyPointNode } from "d3-hierarchy";

export default memo(JoinAnotherTableButton);

function JoinAnotherTableButton({
  joinActions,
  positionStyle,
  parentNode,
  schemas,
}: {
  joinActions: ComponentProps<typeof TableNavigator>["joinActions"];
  positionStyle: CSSProperties;
  schemas: ComponentProps<typeof TableNavigator>["schemas"];
  parentNode: HierarchyPointNode<PreparedJoinDef>;
}) {
  const parentJoin = parentNode.data;

  const [otherTablesSearch, setOtherTablesSearch] = useState("");

  const adjacentTables = useMemo(
    () =>
      findTableFromSchemas(
        schemas,
        ...splitTableRef(parentJoin.tableRef)
      ).columns.flatMap((column) => [
        ...column.foreignKeys.map(
          (ref) => [ref.foreignSchemaName, ref.foreignTableName] as const
        ),
        ...column.foreignKeyReferences.map(
          (ref) => [ref.localSchemaName, ref.localTableName] as const
        ),
      ]),
    [parentJoin.tableRef, schemas]
  );

  const otherTables = useMemo(() => {
    const [parentSchema, parentTable] = splitTableRef(parentJoin.tableRef);
    return getRelationsForTable(schemas, parentSchema, parentTable)
      .filter(
        (table) =>
          !adjacentTables.some(
            ([schemaName, tableName]) =>
              schemaName === table.schemaName && tableName === table.name
          )
      )
      .map((table) => [table.schemaName, table.name] as const)
      .filter(([schemaName, tableName]) =>
        `${schemaName}.${tableName}`.includes(otherTablesSearch)
      );
  }, [adjacentTables, otherTablesSearch, parentJoin.tableRef, schemas]);

  return (
    <div style={positionStyle} className="absolute flex items-center">
      <Popover position="bottom" withArrow shadow="md">
        <Popover.Target>
          <Button rightSection={<TbTablePlus size={20} />} variant="light">
            Join another table
          </Button>
        </Popover.Target>
        <Popover.Dropdown className="h-[600px] !w-[400px] overflow-auto">
          <div className="flex flex-col gap-[8px] pb-[8px] pt-[4px]">
            <div className="text-sm text-slate-600">Adjacent tables</div>
            {[...adjacentTables, null, ...otherTables].map((maybeTableRef) => {
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
                            onClick={() => setOtherTablesSearch("")}
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
                ...parentNode.ancestors(),
                ...parentNode.descendants(),
              ].find(
                (otherNode) =>
                  otherNode.data.tableRef === `${tableSchema}.${tableName}`
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
                        joinActions(parentJoin.joinAlias).addJoin(
                          `${tableSchema}.${tableName}`
                        )
                      }
                    >
                      {existingJoin ? (
                        <TbCheck size={16} className="text-slate-800" />
                      ) : (
                        <TbTablePlus size={16} className="text-slate-800" />
                      )}
                      {tableName}
                    </button>
                  </Tooltip>
                </div>
              );
            })}
          </div>
        </Popover.Dropdown>
      </Popover>
    </div>
  );
}

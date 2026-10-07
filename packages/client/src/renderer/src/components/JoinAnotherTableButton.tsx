import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Hint } from "./Hint";
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
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="secondary">
            Join another table <TbTablePlus aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          align="start"
          className="max-h-[min(600px,var(--radix-popover-content-available-height))] w-[400px] max-w-[calc(100vw-2rem)] overflow-auto"
        >
          <div className="flex flex-col gap-[8px] pb-[8px] pt-[4px]">
            <div className="text-sm text-slate-600">Adjacent tables</div>
            {[...adjacentTables, null, ...otherTables].map((maybeTableRef) => {
              if (!maybeTableRef) {
                return (
                  <div key="divider">
                    <hr />
                    <div className="relative mt-2">
                      <TbSearch
                        aria-hidden="true"
                        className="absolute left-3 top-2.5 size-4 text-muted-foreground"
                      />
                      <Input
                        type="search"
                        aria-label="Filter other tables"
                        placeholder="Filter other tables"
                        value={otherTablesSearch}
                        onChange={(event) =>
                          setOtherTablesSearch(event.target.value)
                        }
                        className="pl-9 pr-9"
                      />
                      {otherTablesSearch && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0"
                          aria-label="Clear table search"
                          onClick={() => setOtherTablesSearch("")}
                        >
                          <TbX />
                        </Button>
                      )}
                    </div>
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
                  <Hint
                    content="Records already joined"
                    disabled={!existingJoin}
                    side="right"
                  >
                    <button
                      type="button"
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
                  </Hint>
                </div>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Hint } from "./Hint";
import {
  findTableFromSchemas,
  getRelationsForTable,
  PreparedJoinDef,
  PreparedQuery,
  splitTableRef,
} from "@quory/core";
import { memo, useMemo, useState } from "react";
import type { useQuery, useFetchSchema } from "@quory/stack/react";
import { TbCheck, TbSearch, TbTablePlus, TbX } from "react-icons/tb";
import classNames from "classnames";
import { Plus } from "lucide-react";

export default memo(JoinAnotherTableButton);

function JoinAnotherTableButton({
  joinActions,
  parentJoin,
  query,
  schemas,
}: {
  joinActions: ReturnType<typeof useQuery>["joinActions"];
  schemas: NonNullable<ReturnType<typeof useFetchSchema>["data"]>["schemas"];
  parentJoin: PreparedJoinDef;
  query: PreparedQuery;
}) {
  function findAncestors(join: PreparedJoinDef): PreparedJoinDef[] | null {
    if (join.joinAlias === parentJoin.joinAlias) return [join];
    for (const child of join.joins) {
      const path = findAncestors(child);
      if (path) return [join, ...path];
    }
    return null;
  }
  function descendants(join: PreparedJoinDef): PreparedJoinDef[] {
    return [join, ...join.joins.flatMap(descendants)];
  }
  const existingTables = new Set(
    [...(findAncestors(query.base) ?? []), ...descendants(parentJoin)].map(
      (join) => join.tableRef
    )
  );

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
    <Popover>
      <Hint content="Add related table">
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6 shrink-0 rounded text-slate-500 shadow-none hover:bg-slate-100 hover:text-slate-900"
            aria-label={`Add related table to ${
              splitTableRef(parentJoin.tableRef)[1]
            }`}
          >
            <Plus aria-hidden="true" className="size-3.5" />
          </Button>
        </PopoverTrigger>
      </Hint>
      <PopoverContent
        side="bottom"
        align="start"
        className="max-h-[min(600px,var(--radix-popover-content-available-height))] w-[360px] max-w-[calc(100vw-2rem)] overflow-auto border-slate-300 shadow-none"
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
                      className="pl-9 pr-9 shadow-none"
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
            const existingJoin = existingTables.has(
              `${tableSchema}.${tableName}`
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
                      "m-0 flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm text-slate-700 disabled:text-slate-400 [&:not(:disabled)]:hover:bg-slate-100"
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
                    <span className="min-w-0 break-all">{tableName}</span>
                  </button>
                </Hint>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

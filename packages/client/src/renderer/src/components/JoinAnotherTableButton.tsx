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
import { filterRelatedTables } from "./filterRelatedTables";

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

  const [tableSearch, setTableSearch] = useState("");
  const [open, setOpen] = useState(false);

  const adjacentTables = useMemo(() => {
    const tables = findTableFromSchemas(
      schemas,
      ...splitTableRef(parentJoin.tableRef)
    ).columns.flatMap((column) => [
      ...column.foreignKeys.map(
        (ref) => [ref.foreignSchemaName, ref.foreignTableName] as const
      ),
      ...column.foreignKeyReferences.map(
        (ref) => [ref.localSchemaName, ref.localTableName] as const
      ),
    ]);
    // Several foreign keys can lead to the same table. Render one option per
    // table so React keys stay unique as the search removes and restores rows.
    return [
      ...new Map(
        tables.map((table) => [JSON.stringify(table), table])
      ).values(),
    ];
  }, [parentJoin.tableRef, schemas]);

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
      .map((table) => [table.schemaName, table.name] as const);
  }, [adjacentTables, parentJoin.tableRef, schemas]);
  const filteredAdjacentTables = filterRelatedTables(
    adjacentTables,
    tableSearch
  );
  const filteredOtherTables = filterRelatedTables(otherTables, tableSearch);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Hint content="Join a related table">
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-full w-full gap-1 rounded-md border border-dashed border-slate-400 bg-white px-1 text-xs text-slate-500 shadow-none hover:border-teal-600 hover:bg-teal-50 hover:text-teal-700"
            aria-label={`Add related table to ${
              splitTableRef(parentJoin.tableRef)[1]
            }`}
          >
            <Plus aria-hidden="true" className="size-3.5" />
            Join table
          </Button>
        </PopoverTrigger>
      </Hint>
      <PopoverContent
        side="bottom"
        align="start"
        className="max-h-[min(600px,var(--radix-popover-content-available-height))] w-[360px] max-w-[calc(100vw-2rem)] overflow-auto border-slate-300 shadow-none"
      >
        <div className="relative mb-2">
          <TbSearch
            aria-hidden="true"
            className="absolute left-3 top-2.5 size-4 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label="Filter tables"
            placeholder="Filter tables"
            value={tableSearch}
            onChange={(event) => setTableSearch(event.target.value)}
            className="pl-9 pr-9 shadow-none"
          />
          {tableSearch && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0"
              aria-label="Clear table search"
              onClick={() => setTableSearch("")}
            >
              <TbX />
            </Button>
          )}
        </div>
        <div className="flex flex-col gap-[8px] pb-[8px] pt-[4px]">
          {filteredAdjacentTables.length > 0 && (
            <div className="text-sm text-slate-600">Adjacent tables</div>
          )}
          {filteredAdjacentTables.length === 0 &&
            filteredOtherTables.length === 0 && (
              <p className="py-2 text-sm text-slate-500">No matching tables</p>
            )}
          {[
            ...filteredAdjacentTables,
            ...(filteredAdjacentTables.length && filteredOtherTables.length
              ? [null]
              : []),
            ...filteredOtherTables,
          ].map((maybeTableRef) => {
            if (!maybeTableRef) {
              return <hr key="divider" />;
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
                    onClick={() => {
                      joinActions(parentJoin.joinAlias).addJoin(
                        `${tableSchema}.${tableName}`
                      );
                      setOpen(false);
                    }}
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

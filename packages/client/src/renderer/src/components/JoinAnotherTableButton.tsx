import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Hint } from "./Hint";
import {
  findTableFromSchemas,
  getRelationsForTable,
  PreparedJoinDef,
  PreparedQuery,
  splitTableRef,
} from "@quory/core";
import { memo, useMemo, useRef, useState } from "react";
import type { useQuery, useFetchSchema } from "@quory/stack/react";
import { Check, Plus, Table2, X } from "lucide-react";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "./ui/command";
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
      (join) => join.tableRef,
    ),
  );

  const [tableSearch, setTableSearch] = useState("");
  const [open, setOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);

  const adjacentTables = useMemo(() => {
    const tables = findTableFromSchemas(
      schemas,
      ...splitTableRef(parentJoin.tableRef),
    ).columns.flatMap((column) => [
      ...column.foreignKeys.map(
        (ref) => [ref.foreignSchemaName, ref.foreignTableName] as const,
      ),
      ...column.foreignKeyReferences.map(
        (ref) => [ref.localSchemaName, ref.localTableName] as const,
      ),
    ]);
    // Several foreign keys can lead to the same table. Render one option per
    // table so React keys stay unique as the search removes and restores rows.
    return [
      ...new Map(
        tables.map((table) => [JSON.stringify(table), table]),
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
              schemaName === table.schemaName && tableName === table.name,
          ),
      )
      .map((table) => [table.schemaName, table.name] as const);
  }, [adjacentTables, parentJoin.tableRef, schemas]);
  const filteredAdjacentTables = filterRelatedTables(
    adjacentTables,
    tableSearch,
  );
  const filteredOtherTables = filterRelatedTables(otherTables, tableSearch);

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) setTableSearch("");
      }}
    >
      <Hint content="Join a related table">
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-full w-full gap-1 rounded-md border border-dashed border-border bg-card px-1 text-xs text-muted-foreground shadow-none hover:border-primary hover:bg-primary-subtle hover:text-primary-emphasis"
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
        className="flex max-h-[min(480px,var(--radix-popover-content-available-height))] w-90 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border-border bg-card p-0 shadow-none"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          searchInput.current?.focus();
        }}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background/60 px-3 py-2.5">
          <Table2
            aria-hidden="true"
            className="size-3.5 shrink-0 text-muted-foreground"
          />
          <h3 className="text-xs font-semibold text-foreground">Join table</h3>
          <span
            className="ml-auto truncate text-[11px] text-muted-foreground"
            title={parentJoin.tableRef}
          >
            From {parentJoin.tableRef}
          </span>
        </div>
        <Command
          label="Filter tables"
          shouldFilter={false}
          loop
          className="h-auto min-h-0 rounded-none bg-card text-foreground **:data-command-input-wrapper:border-border"
        >
          <div className="relative shrink-0">
            <CommandInput
              ref={searchInput}
              aria-label="Filter tables"
              placeholder="Filter tables…"
              value={tableSearch}
              onValueChange={setTableSearch}
              className="h-9 py-2 pr-7 text-xs placeholder:text-muted-foreground"
            />
            {tableSearch && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute top-1 right-1 size-7 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Clear table search"
                onClick={() => {
                  setTableSearch("");
                  searchInput.current?.focus();
                }}
              >
                <X aria-hidden="true" className="size-3.5" />
              </Button>
            )}
          </div>
          <CommandList
            aria-label="Related tables"
            className="max-h-80 min-h-0 overscroll-contain p-1"
          >
            <CommandEmpty>No matching tables</CommandEmpty>
            {[
              { title: "Adjacent tables", tables: filteredAdjacentTables },
              { title: "Other related tables", tables: filteredOtherTables },
            ].map(
              ({ title, tables }, groupIndex) =>
                tables.length > 0 && (
                  <div key={title}>
                    {groupIndex > 0 && filteredAdjacentTables.length > 0 && (
                      <CommandSeparator className="mx-1 my-1 bg-border" />
                    )}
                    <CommandGroup
                      heading={title}
                      className="p-0 **:[[cmdk-group-heading]]:text-[10px] **:[[cmdk-group-heading]]:text-muted-foreground"
                    >
                      {tables.map(([tableSchema, tableName]) => {
                        const tableRef = `${tableSchema}.${tableName}`;
                        const existingJoin = existingTables.has(tableRef);
                        return (
                          <Hint
                            key={tableRef}
                            content="Records already joined"
                            disabled={!existingJoin}
                            side="right"
                          >
                            <CommandItem
                              value={tableRef}
                              aria-label={tableName}
                              disabled={existingJoin}
                              className="gap-2 rounded-md px-2 py-2 text-xs text-foreground data-[selected=true]:bg-primary-subtle data-[selected=true]:text-primary-emphasis"
                              onSelect={() => {
                                joinActions(parentJoin.joinAlias).addJoin(
                                  tableRef,
                                );
                                setOpen(false);
                              }}
                            >
                              {existingJoin ? (
                                <Check
                                  aria-hidden="true"
                                  className="size-3.5 text-muted-foreground"
                                />
                              ) : (
                                <Table2
                                  aria-hidden="true"
                                  className="size-3.5 text-primary-emphasis"
                                />
                              )}
                              <span className="min-w-0 flex-1 truncate font-medium">
                                {tableName}
                              </span>
                              <span className="shrink-0 text-[10px] text-muted-foreground">
                                {tableSchema}
                              </span>
                            </CommandItem>
                          </Hint>
                        );
                      })}
                    </CommandGroup>
                  </div>
                ),
            )}
          </CommandList>
        </Command>
        <div className="shrink-0 border-t border-border bg-background/60 px-3 py-2 text-[10px] text-muted-foreground">
          ↑ ↓ to navigate · Enter to join
        </div>
      </PopoverContent>
    </Popover>
  );
}

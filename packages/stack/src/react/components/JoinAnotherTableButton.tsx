import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Hint } from "./Hint";
import {
  MAX_QUERY_TABLES,
  type DatabaseSchema,
  PreparedJoinDef,
  PreparedQuery,
  splitTableRef,
} from "@quory/core";
import { Fragment, memo, useMemo, useRef, useState } from "react";
import type useQuery from "../hooks/useQuery";
import { ArrowRight, Check, Pencil, Plus, Table2, X } from "lucide-react";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
} from "./ui/command";
import { filterRelatedTables } from "./filterRelatedTables";
import {
  buildJoinGraph,
  suggestedJoinPaths,
  type JoinHop,
} from "./joinRouteOptions";
import { CustomJoinPath } from "./JoinPathPicker";

export default memo(JoinAnotherTableButton);

function JoinAnotherTableButton({
  joinActions,
  parentJoin,
  query,
  schemas,
}: {
  joinActions: ReturnType<typeof useQuery>["joinActions"];
  schemas: DatabaseSchema[];
  parentJoin: PreparedJoinDef;
  query: PreparedQuery;
}) {
  const [open, setOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Hint content="Join a related table">
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="border-border bg-card text-muted-foreground hover:border-primary hover:bg-primary-subtle hover:text-primary-emphasis h-full w-full gap-1 rounded-md border border-dashed px-1 text-xs shadow-none"
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
        className="border-border bg-card flex max-h-[min(480px,var(--radix-popover-content-available-height))] w-[28rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg p-0 shadow-none"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          searchInput.current?.focus();
        }}
      >
        <TablePicker
          parentJoin={parentJoin}
          schemas={schemas}
          query={query}
          searchInput={searchInput}
          onJoin={(path) => {
            joinActions(parentJoin.joinAlias).addJoin(
              path[path.length - 1]!.step.tableRef,
              path.map((hop) => hop.step),
            );
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function TablePicker({
  parentJoin,
  query,
  schemas,
  searchInput,
  onJoin,
}: {
  parentJoin: PreparedJoinDef;
  query: PreparedQuery;
  schemas: DatabaseSchema[];
  searchInput: React.RefObject<HTMLInputElement | null>;
  onJoin: (path: JoinHop[]) => void;
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
  const [highlighted, setHighlighted] = useState("");
  const [customTarget, setCustomTarget] = useState<string | null>(null);
  const graph = useMemo(() => buildJoinGraph(schemas), [schemas]);
  const paths = useMemo(
    () => suggestedJoinPaths(graph, parentJoin.tableRef),
    [graph, parentJoin.tableRef],
  );
  const tableLabel = useMemo(() => {
    const counts = new Map<string, number>();
    for (const schema of schemas) {
      for (const { name } of schema.tables)
        counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return (ref: string) => {
      const [, name] = splitTableRef(ref);
      return counts.get(name) === 1 ? name : ref;
    };
  }, [schemas]);
  const tables = useMemo(
    () => Array.from(paths.incoming.keys(), splitTableRef),
    [paths],
  );
  const filteredTables = useMemo(
    () =>
      filterRelatedTables(tables, tableSearch)
        .map((parts) => parts.join("."))
        .sort(
          (a, b) =>
            paths.incoming.get(a)!.distance - paths.incoming.get(b)!.distance,
        ),
    [tables, tableSearch, paths],
  );
  const maxHops = MAX_QUERY_TABLES - descendants(query.base).length;
  if (customTarget)
    return (
      <CustomJoinPath
        source={parentJoin.tableRef}
        target={customTarget}
        tableLabel={tableLabel}
        graph={graph}
        maxHops={maxHops}
        onJoin={onJoin}
        onCancel={() => {
          setCustomTarget(null);
          requestAnimationFrame(() => searchInput.current?.focus());
        }}
      />
    );

  return (
    <>
      <div className="border-border bg-background/60 flex shrink-0 items-center gap-2 border-b px-3 py-2.5">
        <Table2
          aria-hidden="true"
          className="text-muted-foreground size-3.5 shrink-0"
        />
        <h3 className="text-foreground text-xs font-semibold">Join table</h3>
      </div>
      <Command
        value={highlighted}
        onValueChange={setHighlighted}
        label="Filter tables"
        shouldFilter={false}
        loop
        className="bg-card text-foreground **:data-command-input-wrapper:border-border h-auto min-h-0 rounded-none"
      >
        <div className="relative shrink-0">
          <CommandInput
            ref={searchInput}
            aria-label="Filter tables"
            placeholder="Filter tables…"
            value={tableSearch}
            onValueChange={setTableSearch}
            className="placeholder:text-muted-foreground h-9 py-2 pr-7 text-xs"
          />
          {tableSearch && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:bg-muted hover:text-foreground absolute top-1 right-1 size-7"
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
          className="max-h-80 min-h-0 overflow-x-auto overscroll-contain p-2"
        >
          <CommandEmpty>No matching tables</CommandEmpty>
          {filteredTables.map((ref) => {
            const path = paths.pathTo(ref);
            const intermediateTables = path
              .slice(0, -1)
              .map((hop) => tableLabel(hop.step.tableRef));
            const existing = existingTables.has(ref);
            const overLimit = paths.incoming.get(ref)!.distance > maxHops;
            const Icon = existing ? Check : Table2;
            return (
              <div
                key={ref}
                className="group/table-row relative"
                data-highlighted={highlighted === ref}
              >
                <Hint
                  content={
                    existing
                      ? "Records already joined"
                      : `Queries support up to ${MAX_QUERY_TABLES} tables`
                  }
                  disabled={!existing && !overLimit}
                  side="right"
                >
                  <CommandItem
                    value={ref}
                    aria-label={tableLabel(ref)}
                    aria-description={
                      intermediateTables.length
                        ? `via ${intermediateTables.join(", ")}`
                        : undefined
                    }
                    disabled={existing || overLimit}
                    className="text-foreground data-[selected=true]:bg-primary-subtle data-[selected=true]:text-primary-emphasis min-h-8 gap-2 rounded-md py-1 pl-2 pr-9 text-xs"
                    onSelect={() => onJoin(path)}
                  >
                    <Icon
                      aria-hidden="true"
                      className="text-primary-emphasis size-3.5 shrink-0"
                    />
                    <span className="min-w-0 break-all font-medium">
                      {tableLabel(ref)}
                    </span>
                    {intermediateTables.length > 0 && (
                      <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1">
                        <span className="text-muted-foreground text-[11px]">
                          via{" "}
                        </span>
                        {intermediateTables.map((table, index) => (
                          <Fragment key={table}>
                            {index > 0 && (
                              <ArrowRight
                                aria-hidden="true"
                                className="text-muted-foreground size-3 shrink-0"
                              />
                            )}
                            <Badge
                              variant="outline"
                              className="border-primary/30 bg-primary-subtle text-primary-emphasis min-w-0 break-all px-1.5 py-0.5 text-[11px] font-medium"
                            >
                              {table}
                            </Badge>
                          </Fragment>
                        ))}
                      </div>
                    )}
                  </CommandItem>
                </Hint>
                {!existing && !overLimit && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Custom path to ${tableLabel(ref)}`}
                    className="text-muted-foreground hover:text-primary-emphasis pointer-events-none absolute top-1 right-1 size-6 rounded opacity-0 transition-opacity group-hover/table-row:pointer-events-auto group-hover/table-row:opacity-100 group-focus-within/table-row:pointer-events-auto group-focus-within/table-row:opacity-100 group-data-[highlighted=true]/table-row:pointer-events-auto group-data-[highlighted=true]/table-row:opacity-100 motion-reduce:transition-none [&_svg]:size-3.5"
                    onFocus={() => setHighlighted(ref)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ")
                        event.stopPropagation();
                    }}
                    onClick={() => setCustomTarget(ref)}
                  >
                    <Pencil aria-hidden="true" />
                  </Button>
                )}
              </div>
            );
          })}
        </CommandList>
      </Command>
      <div className="border-border bg-background/60 text-muted-foreground shrink-0 border-t px-3 py-2 text-[10px]">
        ↑ ↓ to navigate · Enter to join
      </div>
    </>
  );
}

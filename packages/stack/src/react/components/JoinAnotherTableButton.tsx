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
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type useQuery from "../hooks/useQuery";
import { Pencil, Plus, Table2, X } from "lucide-react";
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
  createJoinTableLabel,
  suggestedJoinPaths,
  type JoinHop,
} from "./joinRouteOptions";
import { SuggestedJoinPaths } from "./SuggestedJoinPaths";
import { promoteJoinTables, shortlistJoinTables } from "./joinTableRanking";
import { useJoinRanker } from "../JoinRankingContext";
import { Spinner } from "./LoadingState";
import {
  selectedColumnContext,
  shortlistJoinColumns,
  selectJoinColumns,
} from "./joinColumnSelection";
import { describeJoinPath } from "./joinPathSuggestions";
import { useRankedJoinTables } from "./useRankedJoinTables";

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
  const ranker = useJoinRanker();
  const [choosingColumns, setChoosingColumns] = useState(false);
  const pendingColumns = useRef<AbortController | null>(null);
  useEffect(() => {
    pendingColumns.current?.abort();
    pendingColumns.current = null;
    setChoosingColumns(false);
    return () => pendingColumns.current?.abort();
  }, [query, ranker, schemas]);
  const changeOpen = (next: boolean) => {
    if (!next) {
      pendingColumns.current?.abort();
      pendingColumns.current = null;
      setChoosingColumns(false);
    }
    setOpen(next);
  };
  const joinPath = async (path: JoinHop[]) => {
    if (pendingColumns.current || !path.length) return;
    const target = path[path.length - 1]!.step.tableRef;
    const [schemaName, tableName] = splitTableRef(target);
    const table = schemas
      .find(({ name }) => name === schemaName)
      ?.tables.find(({ name }) => name === tableName);
    if (!table?.columns.length) return;
    const context = selectedColumnContext(query.base);
    const { candidates, fallback } = shortlistJoinColumns(
      table,
      context.flatMap(({ columns }) => columns),
    );
    let columns = fallback;
    if (ranker && candidates.length > 1) {
      const controller = new AbortController();
      pendingColumns.current = controller;
      setChoosingColumns(true);
      columns = await selectJoinColumns(
        ranker,
        {
          kind: "columns",
          sourceTable: parentJoin.tableRef,
          targetTable: target,
          joinedTables: context.map(({ tableRef }) => tableRef),
          selectedColumns: context,
          joinPath: describeJoinPath(parentJoin.tableRef, path).slice(0, 12000),
          candidates,
        },
        fallback,
        table.columns.map(({ name }) => name),
        controller.signal,
      );
      if (controller.signal.aborted) return;
      pendingColumns.current = null;
    }
    joinActions(parentJoin.joinAlias).addJoin(
      target,
      path.map((hop) => hop.step),
      columns,
    );
    changeOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={changeOpen}>
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
        {choosingColumns ? (
          <div className="flex flex-col items-center gap-3 p-6">
            <div
              role="status"
              className="text-muted-foreground flex items-center gap-2 text-sm"
            >
              <Spinner /> Choosing columns…
            </div>
            <Button variant="ghost" size="sm" onClick={() => changeOpen(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <TablePicker
            parentJoin={parentJoin}
            schemas={schemas}
            query={query}
            searchInput={searchInput}
            onJoin={joinPath}
          />
        )}
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
  function descendants(join: PreparedJoinDef): PreparedJoinDef[] {
    return [join, ...join.joins.flatMap(descendants)];
  }

  const [tableSearch, setTableSearch] = useState("");
  const tableList = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const resetScroll = () => {
      if (tableList.current) tableList.current.scrollTop = 0;
    };
    resetScroll();
    // cmdk can scroll the previous selection in a deferred layout update.
    // Finish after that update, even when the first match hasn't changed.
    const frame = requestAnimationFrame(resetScroll);
    return () => cancelAnimationFrame(frame);
  }, [tableSearch]);
  const [highlighted, setHighlighted] = useState("");
  const [target, setTarget] = useState<{ ref: string; custom: boolean } | null>(
    null,
  );
  const graph = useMemo(() => buildJoinGraph(schemas), [schemas]);
  const paths = useMemo(
    () => suggestedJoinPaths(graph, parentJoin.tableRef),
    [graph, parentJoin.tableRef],
  );
  const tableLabel = useMemo(() => createJoinTableLabel(schemas), [schemas]);
  const tables = useMemo(
    () => Array.from(paths.incoming.keys(), splitTableRef),
    [paths],
  );
  const maxHops = MAX_QUERY_TABLES - descendants(query.base).length;
  const joinedTables = descendants(query.base)
    .map((join) => join.tableRef)
    .sort();
  const localTables = tables
    .map((parts) => parts.join("."))
    .sort(
      (a, b) =>
        paths.incoming.get(a)!.distance - paths.incoming.get(b)!.distance ||
        a.localeCompare(b),
    );
  const candidates = shortlistJoinTables(
    localTables
      .filter((ref) => paths.incoming.get(ref)!.distance <= maxHops)
      .map((id) => ({
        id,
        distance: paths.incoming.get(id)!.distance,
        path: paths.pathTo(id),
      })),
    parentJoin.tableRef,
    joinedTables,
  );
  const { pending, orderedIds, useLocal } = useRankedJoinTables({
    kind: "tables",
    sourceTable: parentJoin.tableRef,
    joinedTables,
    candidates,
  });
  // Search relevance takes precedence and searches the entire reachable schema.
  const filteredTables = tableSearch.trim()
    ? filterRelatedTables(tables, tableSearch).map((parts) => parts.join("."))
    : promoteJoinTables(localTables, orderedIds);
  if (target)
    return (
      <SuggestedJoinPaths
        source={parentJoin.tableRef}
        target={target.ref}
        initialCustom={target.custom}
        tableLabel={tableLabel}
        graph={graph}
        maxHops={maxHops}
        joinedTables={joinedTables}
        onJoin={onJoin}
        onCancel={() => {
          setTarget(null);
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
          ref={tableList}
          aria-label="Related tables"
          className="max-h-80 min-h-0 overflow-x-auto overscroll-contain p-2"
        >
          {pending ? (
            <div
              role="status"
              className="text-muted-foreground px-2 py-3 text-xs"
            >
              Finding related tables…
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={useLocal}
              >
                Use local suggestions
              </Button>
            </div>
          ) : (
            <CommandEmpty>No matching tables</CommandEmpty>
          )}
          {!pending &&
            filteredTables.map((ref) => {
              const overLimit = paths.incoming.get(ref)!.distance > maxHops;
              return (
                <div
                  key={ref}
                  className="group/table-row relative"
                  data-highlighted={highlighted === ref}
                >
                  <Hint
                    content={`Queries support up to ${MAX_QUERY_TABLES} tables`}
                    disabled={!overLimit}
                    side="right"
                  >
                    <CommandItem
                      value={ref}
                      aria-label={tableLabel(ref)}
                      disabled={overLimit}
                      className="text-foreground data-[selected=true]:bg-primary-subtle data-[selected=true]:text-primary-emphasis min-h-8 gap-2 rounded-md py-1 pl-2 pr-9 text-xs"
                      onSelect={() => {
                        const direct = graph.get(parentJoin.tableRef)?.get(ref);
                        if (direct?.length === 1) onJoin([direct[0]!]);
                        else setTarget({ ref, custom: false });
                      }}
                    >
                      <Table2
                        aria-hidden="true"
                        className="text-primary-emphasis size-3.5 shrink-0"
                      />
                      <span className="min-w-0 break-all font-medium">
                        {tableLabel(ref)}
                      </span>
                    </CommandItem>
                  </Hint>
                  {!overLimit && (
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
                      onClick={() => setTarget({ ref, custom: true })}
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
        ↑ ↓ to navigate · Enter to select
      </div>
    </>
  );
}

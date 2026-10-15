import { Button } from "./ui/button";
import { Alert, AlertDescription } from "./ui/alert";
import { LoadingState, Spinner } from "./LoadingState";
import { Hint } from "./Hint";
import { Query } from "@quory/core";
import { useQuery, useFetchSchema, useQueryCount } from "@quory/stack/react";
import { useEffect, useMemo, useRef, useState } from "react";
import DataTable from "./DataTable";
import TableNavigator from "./TableNavigator";
import { QueryModeSwitch } from "./QueryModeSwitch";
import { ChevronLeft, ChevronRight, Undo2, Redo2 } from "lucide-react";
import { QueryFilters } from "./QueryFilters";
import useElementSize from "../hooks/useElementSize";

import { keepPreviousData } from "@tanstack/react-query";
import { removeQueryJoin } from "./removeQueryJoin";

import trpc from "../util/tprc";
import { SqlEditor, formatSql } from "./SqlEditor";
import type { CustomSqlQuery } from "../../../shared/sqlQuery";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";

const PAGE_SIZE = 100;

export default function QueryView({
  initialQuery,
  connectionId,
  onConvertToSql,
  onQueryChange,
  showQueryText: controlledShowQueryText,
  onShowQueryTextChange,
  historyControls,
  width: viewWidth,
  height: viewHeight,
}: {
  initialQuery: Query;
  connectionId: string;
  onConvertToSql?: ((query: CustomSqlQuery) => void) | undefined;
  onQueryChange: (query: Query) => void;
  showQueryText?: boolean;
  onShowQueryTextChange?: ((sql: boolean) => void) | undefined;
  historyControls?: {
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
  };
  width: number;
  height: number;
}) {
  const { data: schemaData } = useFetchSchema();
  const [localShowQueryText, setShowQueryText] = useState(false);
  const showQueryText = controlledShowQueryText ?? localShowQueryText;

  const [_query, setQuery] = useState<Query>({
    ...initialQuery,
    limit: PAGE_SIZE,
    offset: Math.floor((initialQuery.offset ?? 0) / PAGE_SIZE) * PAGE_SIZE,
  });

  const incomingQuery = JSON.stringify(initialQuery);
  const previousIncomingQuery = useRef(incomingQuery);
  useEffect(() => {
    if (previousIncomingQuery.current === incomingQuery) return;
    previousIncomingQuery.current = incomingQuery;
    setQuery({
      ...initialQuery,
      limit: PAGE_SIZE,
      offset: Math.floor((initialQuery.offset ?? 0) / PAGE_SIZE) * PAGE_SIZE,
    });
  }, [initialQuery, incomingQuery]);

  function changeQuery(next: Query) {
    const updatedQuery = { ...next, limit: PAGE_SIZE };
    setQuery(updatedQuery);
    onQueryChange(updatedQuery);
  }

  const {
    query,
    data,
    error,
    isLoading,
    joinActions: originalJoinActions,
    cancel,
    refetch,
  } = useQuery(_query, changeQuery, false, {
    placeholderData: keepPreviousData,
  });
  const joinActions: typeof originalJoinActions = (alias) => ({
    ...originalJoinActions(alias),
    removeJoin: () => {
      if (query) changeQuery(removeQueryJoin(query, alias));
    },
  });

  const compiled = trpc.queries.compileSql.useQuery(
    { connectionId, query: _query },
    { enabled: showQueryText, retry: false }
  );
  const [confirmConversion, setConfirmConversion] = useState(false);
  const formattedSql = useMemo(
    () =>
      compiled.data ? formatSql(compiled.data.sql, compiled.data.dialect) : "",
    [compiled.data]
  );

  const [countRequestedFor, setCountRequestedFor] = useState<Query | null>(
    null
  );
  const countQuery = useMemo(
    () => ({ base: _query.base, limit: PAGE_SIZE, offset: 0 }),
    [_query.base]
  );
  const total = useQueryCount(
    countRequestedFor === countQuery ? countQuery : null
  );

  const definitionSize = useElementSize();
  const paginationSize = useElementSize();
  const resultsHeaderSize = useElementSize();
  const queryTextHeight = Math.min(320, Math.max(160, viewHeight * 0.4));
  const tableHeight = Math.max(
    160,
    viewHeight -
      definitionSize.height -
      paginationSize.height -
      resultsHeaderSize.height -
      40
  );

  const [highlightedJoinAlias, setHighlightedJoinAlias] = useState<
    string | null
  >(null);

  if (!schemaData) {
    return <LoadingState />;
  }
  return (
    <div className="w-full min-w-0 max-w-full space-y-3 bg-slate-50 p-3 [&_button]:shadow-none [&_input]:shadow-none">
      <section
        aria-label="Query"
        ref={definitionSize.ref}
        className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white"
      >
        <header className="flex h-11 items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/60 px-4">
          <h2 className="text-sm font-semibold text-slate-700">Query</h2>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 border-r border-slate-200 pr-2">
              <Hint content="Undo query change">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 text-slate-500"
                  aria-label="Undo"
                  disabled={!historyControls?.canUndo}
                  onClick={historyControls?.onUndo}
                >
                  <Undo2 aria-hidden="true" className="size-3.5" />
                </Button>
              </Hint>
              <Hint content="Redo query change">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 text-slate-500"
                  aria-label="Redo"
                  disabled={!historyControls?.canRedo}
                  onClick={historyControls?.onRedo}
                >
                  <Redo2 aria-hidden="true" className="size-3.5" />
                </Button>
              </Hint>
            </div>
            <QueryModeSwitch
              sql={showQueryText}
              onChange={onShowQueryTextChange ?? setShowQueryText}
            />
          </div>
        </header>
        <fieldset disabled={isLoading} className="min-w-0 border-0 p-0">
          {query && !showQueryText && (
            <QueryFilters
              query={query}
              schemas={schemaData.schemas}
              joinActions={joinActions}
              onHighlight={setHighlightedJoinAlias}
            />
          )}
          {showQueryText ? (
            <div className="p-5">
              {compiled.error && (
                <Alert variant="destructive">
                  <AlertDescription>{compiled.error.message}</AlertDescription>
                </Alert>
              )}
              {compiled.isFetching ? (
                <LoadingState label="Preparing SQL…" />
              ) : compiled.data ? (
                <>
                  <SqlEditor
                    value={formattedSql}
                    readOnly
                    dialect={compiled.data.dialect}
                    height={`${queryTextHeight}px`}
                    onRequestEdit={
                      onConvertToSql
                        ? () => setConfirmConversion(true)
                        : undefined
                    }
                  />
                  {!!compiled.data.parameters.length && (
                    <p className="mt-2 break-all font-mono text-xs text-slate-500">
                      Bound parameters:{" "}
                      {JSON.stringify(compiled.data.parameters)}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-slate-500">
                    Click the SQL to convert this relationship query into an
                    editable SQL query.
                  </p>
                </>
              ) : null}
            </div>
          ) : query ? (
            <TableNavigator
              width={Math.max(0, viewWidth - 26)}
              maxHeight={Math.max(200, Math.min(440, viewHeight * 0.5))}
              query={query}
              schemas={schemaData.schemas}
              highlightedJoinAlias={highlightedJoinAlias}
              onChangeHighlightedJoinAlias={setHighlightedJoinAlias}
              joinActions={joinActions}
            />
          ) : null}
        </fieldset>
      </section>
      <section
        aria-label="Results"
        className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white"
      >
        <header
          ref={resultsHeaderSize.ref}
          className="flex h-11 items-center gap-3 border-b border-slate-200 bg-slate-50/60 px-4"
        >
          <h2 className="text-sm font-semibold text-slate-700">Results</h2>
          {data && (
            <span className="text-xs tabular-nums text-slate-500">
              {data.rows.length} rows
            </span>
          )}
          {isLoading && (
            <span
              role="status"
              className="ml-auto flex items-center gap-2 text-xs text-slate-500"
            >
              <Spinner className="size-3.5" />
              <span>Running query…</span>
            </span>
          )}
        </header>
        {error && (
          <Alert variant="destructive" className="m-3 bg-red-100">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}
        {query && data && (
          <fieldset
            disabled={isLoading}
            aria-busy={isLoading}
            className="min-w-0 border-0 p-0"
          >
            <DataTable
              embedded
              width={Math.max(0, viewWidth - 26)}
              height={tableHeight}
              isLoading={isLoading}
              rows={data.rows}
              visibleJoins={data.visibleJoins}
              highlightedJoinAlias={highlightedJoinAlias}
              onChangeHighlightedJoinAlias={setHighlightedJoinAlias}
              joinActions={joinActions}
            />
          </fieldset>
        )}
        <div
          ref={paginationSize.ref}
          role="region"
          aria-label="Results pagination"
          className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white px-4 py-0.5 text-xs text-slate-600 [&_button]:h-6 [&_button]:px-2 [&_button]:text-xs"
        >
          <Button
            variant="ghost"
            size="sm"
            aria-label="Previous"
            disabled={isLoading || !(_query.offset ?? 0)}
            onClick={() =>
              changeQuery({
                ..._query,
                offset: Math.max(0, (_query.offset ?? 0) - PAGE_SIZE),
              })
            }
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </Button>
          <span>Page {Math.floor((_query.offset ?? 0) / PAGE_SIZE) + 1}</span>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Next"
            disabled={
              isLoading ||
              !data ||
              data.rows.length < PAGE_SIZE ||
              (_query.offset ?? 0) > Number.MAX_SAFE_INTEGER - PAGE_SIZE
            }
            onClick={() =>
              changeQuery({
                ..._query,
                offset: (_query.offset ?? 0) + PAGE_SIZE,
              })
            }
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </Button>
          <div aria-live="polite" className="text-muted-foreground">
            {total.count !== null ? (
              <span>{total.count.toLocaleString()} matching rows</span>
            ) : (
              <Hint content="click to fetch count" disabled={total.isLoading}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="font-normal text-muted-foreground"
                  aria-label="Fetch matching row count"
                  aria-busy={total.isLoading}
                  disabled={total.isLoading}
                  onClick={() => setCountRequestedFor(countQuery)}
                >
                  {total.isLoading ? (
                    <>
                      <Spinner />
                      Counting…
                    </>
                  ) : (
                    <span className="underline decoration-dotted underline-offset-4">
                      — matching rows
                    </span>
                  )}
                </Button>
              </Hint>
            )}
          </div>
          {total.error && <span>{total.error.message}</span>}
          {!isLoading && !data && (
            <Button
              onClick={() => {
                void refetch();
              }}
            >
              Run query
            </Button>
          )}
          {isLoading && (
            <Button
              onClick={() => {
                void cancel();
              }}
            >
              Cancel query
            </Button>
          )}
        </div>
      </section>
      <Dialog open={confirmConversion} onOpenChange={setConfirmConversion}>
        <DialogContent>
          <DialogTitle>Convert to a custom SQL query?</DialogTitle>
          <DialogDescription>
            Editing this SQL permanently replaces the relationship query. You
            will no longer be able to use the relationship view or AI chat for
            this query. This conversion cannot be undone.
          </DialogDescription>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmConversion(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (compiled.data) {
                  setConfirmConversion(false);
                  onConvertToSql?.({
                    mode: "sql",
                    sql: formattedSql,
                    parameters: compiled.data.parameters,
                    dialect: compiled.data.dialect,
                  });
                }
              }}
            >
              Convert to SQL
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

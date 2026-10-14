import { Button } from "./ui/button";
import { Alert, AlertDescription } from "./ui/alert";
import { LoadingState, Spinner } from "./LoadingState";
import { Hint } from "./Hint";
import { Query } from "@quory/core";
import { useQuery, useFetchSchema, useQueryCount } from "@quory/stack/react";
import { useEffect, useMemo, useRef, useState } from "react";
import DataTable from "./DataTable";
import TableNavigator from "./TableNavigator";
import { QueryFilters } from "./QueryFilters";
import useElementSize from "../hooks/useElementSize";

import { keepPreviousData } from "@tanstack/react-query";
import { removeQueryJoin } from "./removeQueryJoin";

const PAGE_SIZE = 100;

export default function QueryView({
  initialQuery,
  onDeleteQuery,
  onQueryChange,
  showQueryText = false,
  width: viewWidth,
  height: viewHeight,
}: {
  initialQuery: Query;
  onQueryChange: (query: Query) => void;
  onDeleteQuery: () => void;
  showQueryText?: boolean;
  width: number;
  height: number;
}) {
  const { data: schemaData } = useFetchSchema();

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
  const queryTextHeight = Math.min(320, Math.max(160, viewHeight * 0.4));
  const tableHeight = Math.max(
    160,
    viewHeight - definitionSize.height - paginationSize.height - 24
  );

  const [highlightedJoinAlias, setHighlightedJoinAlias] = useState<
    string | null
  >(null);

  if (!schemaData) {
    return <LoadingState />;
  }
  return (
    <div className="w-full min-w-0 max-w-full bg-slate-50 [&_button]:shadow-none [&_input]:shadow-none">
      <fieldset
        disabled={isLoading}
        className="min-w-0 border-0 p-0"
        ref={definitionSize.ref}
      >
        {query && (
          <QueryFilters
            query={query}
            schemas={schemaData.schemas}
            joinActions={joinActions}
            onHighlight={setHighlightedJoinAlias}
          />
        )}
        {showQueryText ? (
          <div className="p-5">
            <pre
              role="region"
              aria-label="Raw query (JSON)"
              tabIndex={0}
              className="overflow-auto rounded-md border bg-background p-4 font-mono text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              style={{ height: queryTextHeight }}
            >
              <code>{JSON.stringify(_query, null, 2)}</code>
            </pre>
          </div>
        ) : query ? (
          <TableNavigator
            width={viewWidth}
            maxHeight={Math.max(200, Math.min(440, viewHeight * 0.5))}
            query={query}
            schemas={schemaData.schemas}
            highlightedJoinAlias={highlightedJoinAlias}
            onChangeHighlightedJoinAlias={setHighlightedJoinAlias}
            joinActions={joinActions}
            onDeleteQuery={onDeleteQuery}
          />
        ) : null}
      </fieldset>
      <div className="min-w-0 px-4 py-3">
        {error && (
          <Alert variant="destructive" className="mb-3 bg-red-100">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}
        {query && data && (
          <fieldset
            disabled={isLoading}
            aria-busy={isLoading}
            className="min-w-0 border-0 p-0"
          >
            {data.rows[0] ? (
              <DataTable
                width={viewWidth - 32}
                height={tableHeight}
                isLoading={isLoading}
                rows={data.rows}
                visibleJoins={data.visibleJoins}
                highlightedJoinAlias={highlightedJoinAlias}
                onChangeHighlightedJoinAlias={setHighlightedJoinAlias}
                joinActions={joinActions}
              />
            ) : (
              <div className="bg-white p-5">No records found</div>
            )}
          </fieldset>
        )}
      </div>
      <div
        ref={paginationSize.ref}
        role="region"
        aria-label="Results pagination"
        className="flex flex-wrap items-center gap-3 border-t border-slate-200 bg-white px-4 py-3 text-xs text-slate-600"
      >
        <Button
          variant="ghost"
          size="sm"
          disabled={isLoading || !(_query.offset ?? 0)}
          onClick={() =>
            changeQuery({
              ..._query,
              offset: Math.max(0, (_query.offset ?? 0) - PAGE_SIZE),
            })
          }
        >
          Previous
        </Button>
        <span>Page {Math.floor((_query.offset ?? 0) / PAGE_SIZE) + 1}</span>
        <Button
          variant="ghost"
          size="sm"
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
          Next
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
            {!data?.rows.length && (
              <span role="status" title="Running query…">
                <Spinner />
                <span className="sr-only">Running query…</span>
              </span>
            )}
            Cancel query
          </Button>
        )}
      </div>
    </div>
  );
}

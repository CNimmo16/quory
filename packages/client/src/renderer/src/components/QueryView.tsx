import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Alert, AlertDescription } from "./ui/alert";
import { LoadingState, Spinner } from "./LoadingState";
import { Hint } from "./Hint";
import { Query } from "@quory/core";
import { useQuery, useFetchSchema, useQueryCount } from "@quory/stack/react";
import { useMemo, useState } from "react";
import DataTable from "./DataTable";
import TableNavigator from "./TableNavigator";

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

  const legacyLimit =
    Number.isSafeInteger(initialQuery.limit) && (initialQuery.limit ?? 0) > 100;
  const [_query, setQuery] = useState<Query>({
    ...initialQuery,
    limit: legacyLimit
      ? 100
      : initialQuery.limit === undefined
      ? 100
      : initialQuery.limit,
    offset: initialQuery.offset === undefined ? 0 : initialQuery.offset,
  });

  function changeQuery(next: Query) {
    setQuery(next);
    onQueryChange(next);
  }

  const { query, data, error, isLoading, joinActions, cancel, refetch } =
    useQuery(_query, changeQuery);

  const [rowLimit, setRowLimit] = useState(String(_query.limit ?? 100));
  const [countRequestedFor, setCountRequestedFor] = useState<Query | null>(
    null
  );
  const countQuery = useMemo(
    () => ({ base: _query.base, limit: _query.limit, offset: 0 }),
    [_query.base, _query.limit]
  );
  const total = useQueryCount(
    countRequestedFor === countQuery ? countQuery : null
  );

  const treePadding = 20;

  const [treeHeight, setTreeHeight] = useState<number | null>(null);
  const queryTextHeight = Math.min(320, Math.max(160, viewHeight * 0.4));

  const tableHeight = useMemo(() => {
    if (showQueryText) {
      return viewHeight - queryTextHeight - treePadding * 3;
    }
    if (!treeHeight) {
      return 300;
    }
    return viewHeight - treeHeight - treePadding;
  }, [viewHeight, treeHeight, showQueryText, queryTextHeight]);

  const [highlightedJoinAlias, setHighlightedJoinAlias] = useState<
    string | null
  >(null);

  if (!schemaData) {
    return <LoadingState />;
  }
  return (
    <div className="bg-slate-200">
      {legacyLimit && (
        <Alert>
          <AlertDescription>
            This saved query’s row limit was reduced to 100. Save changes to
            keep the new limit.
          </AlertDescription>
        </Alert>
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
          padding={treePadding}
          width={viewWidth}
          onHeightChange={setTreeHeight}
          query={query}
          schemas={schemaData.schemas}
          highlightedJoinAlias={highlightedJoinAlias}
          onChangeHighlightedJoinAlias={setHighlightedJoinAlias}
          joinActions={joinActions}
          onDeleteQuery={onDeleteQuery}
        />
      ) : null}
      <div>
        {error && (
          <Alert variant="destructive" className="mb-3 bg-red-100">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}
        {isLoading && (
          <div className="bg-white p-5">
            <LoadingState label="Running query…" />
          </div>
        )}
        {query && data && !isLoading && (
          <>
            {data.rows[0] ? (
              <DataTable
                width={viewWidth - 30}
                height={Math.max(100, tableHeight - 100)}
                rows={data.rows}
                visibleJoins={data.visibleJoins}
                highlightedJoinAlias={highlightedJoinAlias}
                onChangeHighlightedJoinAlias={setHighlightedJoinAlias}
                joinActions={joinActions}
              />
            ) : (
              <div className="bg-white p-5">No records found</div>
            )}
          </>
        )}
      </div>
      <div
        role="region"
        aria-label="Results pagination"
        className="flex flex-wrap items-center gap-3 border-t bg-background px-4 py-2 text-sm"
      >
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const limit = Number(rowLimit);
            if (Number.isSafeInteger(limit) && limit >= 1 && limit <= 100)
              changeQuery({ ..._query, limit, offset: 0 });
          }}
        >
          <label className="flex items-center gap-2 whitespace-nowrap">
            Rows per page{" "}
            <Input
              aria-label="Rows per page"
              type="number"
              min={1}
              max={100}
              step={1}
              required
              className="w-20"
              value={rowLimit}
              onChange={(event) => setRowLimit(event.target.value)}
            />
          </label>
          <Button type="submit" disabled={isLoading}>
            Apply page size
          </Button>
        </form>
        <Button
          disabled={isLoading || !(_query.offset ?? 0)}
          onClick={() =>
            changeQuery({
              ..._query,
              offset: Math.max(0, (_query.offset ?? 0) - (_query.limit ?? 100)),
            })
          }
        >
          Previous
        </Button>
        <span>
          Page {Math.floor((_query.offset ?? 0) / (_query.limit ?? 100)) + 1}
        </span>
        <Button
          disabled={
            isLoading ||
            !data ||
            data.rows.length < (_query.limit ?? 100) ||
            (_query.offset ?? 0) >
              Number.MAX_SAFE_INTEGER - (_query.limit ?? 100)
          }
          onClick={() =>
            changeQuery({
              ..._query,
              offset: (_query.offset ?? 0) + (_query.limit ?? 100),
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
            Cancel query
          </Button>
        )}
      </div>
    </div>
  );
}

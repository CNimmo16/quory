import { Alert, Loader, LoadingOverlay } from "@mantine/core";
import { PreparedQuery, Query } from "@quory/core";
import { useQuery, useFetchSchema } from "@quory/stack/react";
import { useEffect, useMemo, useState } from "react";
import DataTable from "./DataTable";
import TableNavigator from "./TableNavigator";

export default function QueryView({
  initialQuery,
  onDeleteQuery,
  onQueryChange,
  width: viewWidth,
  height: viewHeight,
}: {
  initialQuery: Query;
  onQueryChange: (query: PreparedQuery) => void;
  onDeleteQuery: () => void;
  width: number;
  height: number;
}) {
  const { data: schemaData } = useFetchSchema();

  const [_query, setQuery] = useState<Query>(initialQuery);

  const { query, data, error, isLoading, joinActions } = useQuery(
    _query,
    setQuery
  );

  useEffect(() => {
    if (!query) return;
    onQueryChange(query);
  }, [query, onQueryChange]);

  const treePadding = 20;

  const [treeHeight, setTreeHeight] = useState<number | null>(null);

  const tableHeight = useMemo(() => {
    if (!treeHeight) {
      return 300;
    }
    return viewHeight - treeHeight - treePadding;
  }, [viewHeight, treeHeight]);

  const [highlightedJoinAlias, setHighlightedJoinAlias] = useState<
    string | null
  >(null);

  if (!schemaData) {
    return <LoadingOverlay />;
  }
  return (
    <div className="bg-slate-200">
      {query && (
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
      )}
      <div>
        {error && (
          <Alert variant="default" className="mb-3 bg-red-100">
            {error.message}
          </Alert>
        )}
        {isLoading && (
          <div className="bg-white p-5">
            <Loader />
          </div>
        )}
        {query && data && !isLoading && (
          <>
            {data.rows[0] ? (
              <DataTable
                width={viewWidth - 30}
                height={tableHeight - 20}
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
    </div>
  );
}

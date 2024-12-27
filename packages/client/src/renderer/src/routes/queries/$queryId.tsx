import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import QueryView from "../../components/QueryView";
import { useCallback } from "react";
import { Query } from "@quory/core";
import trpc from "../../util/tprc";
import { LoadingOverlay } from "@mantine/core";
import useMainDimensions from "../../hooks/useMainDimensions";
import { trpcClient } from "../../GlobalProviders";

export const Route = createFileRoute("/queries/$queryId")({
  component: RouteComponent,
  loader: async ({ params }) => {
    const res = await trpcClient.connections.fetchActiveConnection.query();
    if (!res.connection) {
      throw redirect({ to: "/connections" });
    }

    const data = await trpcClient.queries.fetchQuery.query({
      queryId: params.queryId,
    });

    return data;
  },
});

function RouteComponent() {
  const data = Route.useLoaderData();

  const { queryId } = Route.useParams();

  const navigate = useNavigate({
    from: "/queries/$queryId",
  });

  const utils = trpc.useUtils();

  const { mutate: deleteQuery } = trpc.queries.deleteQuery.useMutation({
    onSuccess: () => {
      utils.queries.listSavedQueries.invalidate();
      navigate({ to: "/queries" });
    },
  });

  const { mutate: updateQuery } = trpc.queries.updateQuery.useMutation();

  const handleQueryChange = useCallback(
    async (query: Query) => {
      if (!data) {
        throw new Error("No data");
      }
      await updateQuery({ queryId, query, revision: data.query._rev });
    },
    [queryId, data, updateQuery]
  );

  const handleDeleteQuery = useCallback(async () => {
    if (!data) {
      throw new Error("No data");
    }
    const confirmed = confirm(
      "Removing the base table will delete the query. Do you want to proceed?"
    );
    if (confirmed) {
      await deleteQuery({ queryId });
    }
  }, [queryId, data, deleteQuery]);

  const { width: mainWidth, height: mainHeight } = useMainDimensions()!;

  if (!data) {
    return <LoadingOverlay />;
  }

  return (
    <QueryView
      key={queryId} // when query id changes load new query view
      initialQuery={data.query}
      onQueryChange={handleQueryChange}
      onDeleteQuery={handleDeleteQuery}
      onChangeDebounceDelaySeconds={10}
      width={mainWidth}
      height={mainHeight}
    />
  );
}

import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { LoadingState, Spinner } from "../../components/LoadingState";
import { TablePicker } from "../../components/TablePicker";
import { useFetchSchema } from "@quory/stack/react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import useMainDimensions from "../../hooks/useMainDimensions";
import { useState } from "react";
import trpc from "../../util/tprc";
import { trpcClient } from "../../GlobalProviders";

export const Route = createFileRoute("/queries/")({
  component: RouteComponent,
  loader: async () => {
    const res = await trpcClient.connections.fetchActiveConnection.query();
    if (!res.connection) {
      throw redirect({ to: "/connections" });
    }
  },
});

function RouteComponent() {
  const { data: schemaData } = useFetchSchema();

  const { width: mainWidth, height: mainHeight } = useMainDimensions()!;

  const [baseTableRef, setBaseTableRef] = useState<string | null>(null);

  const navigate = useNavigate({
    from: "/queries",
  });

  const utils = trpc.useUtils();

  const {
    isPending,
    error,
    mutate: createQuery,
  } = trpc.queries.createQuery.useMutation({
    onSuccess: ({ queryId }) => {
      utils.queries.listSavedQueries.invalidate();
      navigate({ to: `/queries/$queryId`, params: { queryId } });
    },
  });

  if (!schemaData) {
    return <LoadingState />;
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!baseTableRef) {
          return;
        }
        createQuery({
          query: {
            base: {
              tableRef: baseTableRef,
              select: "*",
              joins: [],
            },
            limit: 100,
          },
        });
      }}
    >
      <div
        className="mx-auto px-4 pt-[70px]"
        style={{
          minHeight: Math.max(0, mainHeight - 200),
          width: Math.min(mainWidth, 1000),
        }}
      >
        <div className="flex flex-col gap-4">
          <Label htmlFor="base-table">Choose a table to start from</Label>
          <TablePicker
            id="base-table"
            groups={schemaData.schemas}
            value={baseTableRef}
            onChange={setBaseTableRef}
            maxHeight={mainHeight - 300}
          />
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}
          <Button
            type="submit"
            aria-busy={isPending}
            disabled={!baseTableRef || isPending}
          >
            {isPending && <Spinner />}Go
          </Button>
        </div>
      </div>
    </form>
  );
}

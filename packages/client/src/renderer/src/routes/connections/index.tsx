import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppRouter } from "../../../../main/ipc";
import { inferProcedureInput } from "@trpc/server";
import { ConnectionForm } from "../../components/ConnectionForm";
import trpc from "../../util/tprc";
import { Button } from "../../components/ui/button";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/connections/")({
  component: RouteComponent,
  validateSearch: (
    search: Record<string, unknown>
  ): { queryId?: string; create?: boolean; select?: boolean } => ({
    ...(typeof search.queryId === "string" ? { queryId: search.queryId } : {}),
    ...(search.create === true || search.create === "true"
      ? { create: true }
      : {}),
    ...(search.select === true || search.select === "true"
      ? { select: true }
      : {}),
  }),
});

function RouteComponent() {
  const { queryId, select } = Route.useSearch();
  return (
    <CreateConnectionForm queryId={queryId} selecting={!!queryId || !!select} />
  );
}

function CreateConnectionForm({
  queryId,
  selecting,
}: {
  queryId: string | undefined;
  selecting: boolean;
}) {
  const [config, setConfig] = useState<
    Partial<
      inferProcedureInput<AppRouter["connections"]["saveConnection"]>["config"]
    >
  >({
    hostOrFilePath: "localhost",
  });

  const navigate = useNavigate({ from: "/connections" });

  const utils = trpc.useUtils();

  const {
    mutate: saveConnection,
    isPending: isSavingConnection,
    error: saveConnectionError,
  } = trpc.connections.saveConnection.useMutation({
    onSuccess: (data) => {
      utils.connections.listSavedConnections.invalidate();
      navigate({
        to: "/connections/$connectionId",
        params: { connectionId: data.connectionId },
        search: queryId ? { queryId } : {},
      });
    },
  });

  const error = saveConnectionError;

  return (
    <div className="mx-auto max-w-[600px] p-5">
      {selecting && (
        <Button
          variant="ghost"
          size="sm"
          className="mb-4"
          onClick={() => {
            void navigate({ to: "/queries" });
          }}
        >
          <ArrowLeft aria-hidden="true" />
          Back
        </Button>
      )}
      <h1 className="mb-5 text-2xl">New connection</h1>
      <ConnectionForm
        config={config}
        setConfig={setConfig}
        onSave={() => {
          return saveConnection({
            config: config as Required<typeof config>,
          });
        }}
        saveText="Create connection"
        isSaving={isSavingConnection}
        errorMessage={error?.shape?.message ?? error?.message}
      />
    </div>
  );
}

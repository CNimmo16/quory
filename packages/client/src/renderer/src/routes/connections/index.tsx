import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppRouter } from "../../../../main/ipc";
import { inferProcedureInput } from "@trpc/server";
import { ConnectionForm } from "./$connectionId";
import trpc from "../../util/tprc";

export const Route = createFileRoute("/connections/")({
  component: RouteComponent,
});

function RouteComponent() {
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
      });
    },
  });

  const error = saveConnectionError;

  return (
    <div className="p-5 max-w-[600px] mx-auto">
      <h1 className="text-2xl mb-5">New connection</h1>
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

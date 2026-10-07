import { ConnectionForm } from "../../components/ConnectionForm";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import trpc from "../../util/tprc";
import { AppRouter } from "../../../../main/ipc";
import { inferProcedureInput } from "@trpc/server";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { LoadingState } from "../../components/LoadingState";
import { trpcClient } from "../../GlobalProviders";
import { TbTrash } from "react-icons/tb";

export const Route = createFileRoute("/connections/$connectionId")({
  component: RouteComponent,
  loader: async ({ params: { connectionId } }) => {
    const data = await trpcClient.connections.fetchConnectionById.query({
      connectionId,
    });

    return data;
  },
});

function RouteComponent() {
  const { connection } = Route.useLoaderData();

  const navigate = useNavigate({
    from: "/connections/$connectionId",
  });

  const {
    mutate: saveConnection,
    isPending: isSavingConnection,
    error: saveConnectionERror,
  } = trpc.connections.saveConnection.useMutation({
    onSuccess: () => {
      navigate({
        to: "/connections/$connectionId",
        params: { connectionId: connection._id },
      });
    },
  });

  const utils = trpc.useUtils();

  const {
    mutate: connectToDatabase,
    isPending: isConnectingToDatabase,
    error: connectError,
  } = trpc.connections.connectToDatabase.useMutation({
    onSuccess: () => {
      utils.connections.fetchActiveConnection.invalidate();
      utils.connections.listSavedConnections.invalidate();
      navigate({ to: "/queries" });
    },
  });

  const error = saveConnectionERror ?? connectError;

  const [config, setConfig] =
    useState<
      Partial<
        inferProcedureInput<
          AppRouter["connections"]["saveConnection"]
        >["config"]
      >
    >(connection);

  useEffect(() => {
    setConfig(connection);
  }, [connection]);

  const { mutate: deleteConnection } =
    trpc.connections.deleteConnection.useMutation({
      onSuccess: () => {
        utils.connections.listSavedConnections.invalidate();
        navigate({ to: "/connections" });
      },
    });

  if (!config) {
    return <LoadingState />;
  }

  return (
    <div className="mx-auto max-w-[600px] p-5">
      <div className="mb-5 flex justify-between">
        <h1 className="text-2xl">{connection.nickname}</h1>
        <Button
          className="text-destructive hover:text-destructive"
          variant="outline"
          onClick={(e) => {
            e.preventDefault();
            const confirmed = confirm(
              `IMPORTANT: Are you sure you want to delete this connection?\n\nThis will also delete the queries associated with the connection.\n\nThis action is irreversible. Press OK to continue.`
            );
            if (confirmed) {
              deleteConnection({ connectionId: connection._id });
            }
          }}
        >
          Delete connection <TbTrash aria-hidden="true" />
        </Button>
      </div>
      <ConnectionForm
        config={config}
        setConfig={setConfig}
        onSave={() => {
          saveConnection({
            config: config as Required<typeof config>,
            connectionId: connection._id,
            revision: connection._rev,
          });
        }}
        onConnect={() => {
          connectToDatabase({ connectionId: connection._id });
        }}
        errorMessage={error?.shape?.message ?? error?.message}
        isSaving={isSavingConnection}
        isConnecting={isConnectingToDatabase}
        saveText="Save changes"
      />
    </div>
  );
}

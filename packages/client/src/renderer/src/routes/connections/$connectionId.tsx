import { createFileRoute, useNavigate } from "@tanstack/react-router";
import trpc from "../../util/tprc";
import { AppRouter } from "../../../../main/ipc";
import { inferProcedureInput } from "@trpc/server";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  LoadingOverlay,
  PasswordInput,
  Select,
  TextInput,
  Tooltip,
} from "@mantine/core";
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
    return <LoadingOverlay />;
  }

  return (
    <div className="p-5 max-w-[600px] mx-auto">
      <div className="flex mb-5 justify-between">
        <h1 className="text-2xl">{connection.nickname}</h1>
        <Button
          color="red"
          rightSection={<TbTrash size={16} color="red" />}
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
          Delete connection
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

export function ConnectionForm({
  config,
  setConfig,
  errorMessage,
  onSave,
  onConnect,
  isSaving,
  isConnecting,
  saveText,
}: {
  config: Partial<
    inferProcedureInput<AppRouter["connections"]["saveConnection"]>["config"]
  >;
  setConfig: React.Dispatch<
    React.SetStateAction<
      Partial<
        inferProcedureInput<
          AppRouter["connections"]["saveConnection"]
        >["config"]
      >
    >
  >;
  errorMessage?: string | undefined;
  onSave: () => void;
  isSaving: boolean;
  onConnect?: () => void;
  isConnecting?: boolean;
  saveText: string;
}) {
  const typeSpecificFieldsWithDefaults = useMemo((): typeof config | null => {
    if (!config.type) {
      return null;
    }
    if (config.type === "postgres") {
      return {
        hostOrFilePath: "localhost",
        port: 5432,
        username: "postgres",
        password: "",
        database: "postgres",
      };
    }
    if (config.type === "mysql") {
      return {
        hostOrFilePath: "localhost",
        port: 3306,
        username: "root",
        password: "",
        database: "mysql",
      };
    }
    return null;
  }, [config.type]);

  useEffect(() => {
    if (typeSpecificFieldsWithDefaults) {
      setConfig((prev) => ({
        ...prev,
        ...typeSpecificFieldsWithDefaults,
      }));
    }
  }, [typeSpecificFieldsWithDefaults, setConfig]);

  return (
    <div className="flex items-center justify-center h-full w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
        className="w-full flex flex-col gap-4"
      >
        <Select
          label="Database type"
          data={["postgres", "mysql"]}
          value={config.type ?? ""}
          onChange={(value) =>
            setConfig({ ...config, type: value as "postgres" | "mysql" })
          }
          required
        />
        {typeSpecificFieldsWithDefaults && (
          <>
            {"hostOrFilePath" in typeSpecificFieldsWithDefaults && (
              <TextInput
                label="Host"
                value={config.hostOrFilePath ?? ""}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    hostOrFilePath: event.target.value,
                  })
                }
                required
              />
            )}
            {"port" in typeSpecificFieldsWithDefaults && (
              <TextInput
                label="Port"
                value={config.port ?? ""}
                type="number"
                onChange={(event) =>
                  setConfig({
                    ...config,
                    port: Number(event.target.value),
                  })
                }
                required
              />
            )}
            {"username" in typeSpecificFieldsWithDefaults && (
              <TextInput
                label="Username"
                value={config.username ?? ""}
                onChange={(event) =>
                  setConfig({ ...config, username: event.target.value })
                }
                required
              />
            )}
            {"password" in typeSpecificFieldsWithDefaults && (
              <PasswordInput
                label="Password"
                value={config.password ?? ""}
                onChange={(event) =>
                  setConfig({ ...config, password: event.target.value })
                }
                required
              />
            )}
            {"database" in typeSpecificFieldsWithDefaults && (
              <TextInput
                label="Database"
                value={config.database ?? ""}
                onChange={(event) =>
                  setConfig({ ...config, database: event.target.value })
                }
                required
              />
            )}
            <TextInput
              label="Connection nickname"
              value={config.nickname ?? ""}
              onChange={(event) =>
                setConfig({ ...config, nickname: event.target.value })
              }
              required
            />
          </>
        )}
        {errorMessage && <Alert color="red">{errorMessage}</Alert>}
        <div className="flex gap-3">
          <Button
            type="submit"
            disabled={
              !typeSpecificFieldsWithDefaults ||
              Object.keys(typeSpecificFieldsWithDefaults).some(
                (field) => !config[field as keyof typeof config]
              ) ||
              !config.nickname
            }
            loading={isSaving}
            variant="light"
          >
            {saveText}
          </Button>
          <Tooltip
            label="You must save your new connection before connecting"
            disabled={!!onConnect}
          >
            <Button
              type="button"
              onClick={onConnect}
              disabled={!onConnect}
              loading={isConnecting ?? false}
            >
              Connect
            </Button>
          </Tooltip>
        </div>
      </form>
    </div>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppRouter } from "../../../../main/ipc";
import { inferProcedureInput, inferRouterOutputs } from "@trpc/server";
import { ConnectionForm } from "../../components/ConnectionForm";
import trpc from "../../util/tprc";
import { Button } from "../../components/ui/button";
import { ArrowLeft } from "lucide-react";
import { trpcClient } from "../../util/trpcClient";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";

type Connections =
  inferRouterOutputs<AppRouter>["connections"]["listSavedConnections"]["connections"];

type ConnectionConfig = inferProcedureInput<
  AppRouter["connections"]["saveConnection"]
>["config"];

function copyConfig(
  source: ConnectionConfig,
  nicknames: string[],
): ConnectionConfig {
  let nickname = `${source.nickname} copy`;
  let suffix = 2;
  while (nicknames.includes(nickname))
    nickname = `${source.nickname} copy ${suffix++}`;
  // Copy settings only: never reuse the identity, revision or project of the source.
  return {
    nickname,
    type: source.type,
    hostOrFilePath: source.hostOrFilePath,
    port: source.port,
    username: source.username,
    password: source.password,
    database: source.database,
    ssl: source.ssl ? { ...source.ssl } : undefined,
    colour: source.colour,
    writeProtection: source.writeProtection,
    temporary: false,
  };
}

export const Route = createFileRoute("/connections/")({
  component: RouteComponent,
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    queryId?: string;
    create?: boolean;
    select?: boolean;
    sourceConnectionId?: string;
  } => ({
    ...(typeof search.sourceConnectionId === "string"
      ? { sourceConnectionId: search.sourceConnectionId }
      : {}),
    ...(typeof search.queryId === "string" ? { queryId: search.queryId } : {}),
    ...(search.create === true || search.create === "true"
      ? { create: true }
      : {}),
    ...(search.select === true || search.select === "true"
      ? { select: true }
      : {}),
  }),
  loaderDeps: ({ search }) => ({
    sourceConnectionId: search.sourceConnectionId,
  }),
  loader: async ({ deps: { sourceConnectionId } }) => {
    const { connections } =
      await trpcClient.connections.listSavedConnections.query();
    const source = connections.find(({ id }) => id === sourceConnectionId);
    if (sourceConnectionId && !source)
      throw new Error(
        "This connection is not available in the current project.",
      );
    return { connections, source };
  },
});

function RouteComponent() {
  const { queryId, select, sourceConnectionId } = Route.useSearch();
  const { connections, source } = Route.useLoaderData();
  return (
    <CreateConnectionForm
      key={sourceConnectionId ?? "new"}
      queryId={queryId}
      selecting={!!queryId || !!select}
      connections={connections}
      source={source}
    />
  );
}

function CreateConnectionForm({
  queryId,
  selecting,
  connections,
  source,
}: {
  queryId: string | undefined;
  selecting: boolean;
  connections: Connections;
  source: Connections[number] | undefined;
}) {
  const [config, setConfig] = useState<
    Partial<
      inferProcedureInput<AppRouter["connections"]["saveConnection"]>["config"]
    >
  >(() =>
    source
      ? copyConfig(
          source.connection,
          connections.map(({ connection }) => connection.nickname),
        )
      : { hostOrFilePath: "localhost" },
  );
  const [templateId, setTemplateId] = useState(source?.id ?? "blank");

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
    <div className="mx-auto max-w-150 p-5">
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
      <div className="mb-5 space-y-2">
        <Label htmlFor="connection-template">
          Start from an existing connection
        </Label>
        <Select
          value={templateId}
          disabled={isSavingConnection}
          onValueChange={(id) => {
            setTemplateId(id);
            const selected = connections.find(
              (connection) => connection.id === id,
            );
            setConfig(
              selected
                ? {
                    ...copyConfig(
                      selected.connection,
                      connections.map(({ connection }) => connection.nickname),
                    ),
                    temporary: config.temporary ?? false,
                  }
                : {
                    hostOrFilePath: "localhost",
                    temporary: config.temporary ?? false,
                  },
            );
          }}
        >
          <SelectTrigger id="connection-template">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="blank">Start from scratch</SelectItem>
            {connections.map(({ id, connection }) => (
              <SelectItem key={id} value={id}>
                {connection.nickname}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <ConnectionForm
        creating
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

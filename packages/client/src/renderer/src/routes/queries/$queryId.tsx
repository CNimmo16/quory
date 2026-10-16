import {
  createFileRoute,
  redirect,
  useNavigate,
  useRouter,
  useBlocker,
} from "@tanstack/react-router";
import { useState } from "react";
import { isSqlQuery, type CustomSqlQuery } from "../../../../shared/sqlQuery";
import { SqlQueryWorkspace } from "../../components/SqlQueryWorkspace";
import { type Query } from "@quory/core";
import { useFetchSchema } from "@quory/stack/react";
import {
  appendQueryVersion,
  createQueryHistory,
  queriesMatch,
  moveQueryHistory,
  type QueryHistory,
} from "../../../../shared/queryHistory";
import { AiOutlineCheck } from "react-icons/ai";
import QueryView from "../../components/QueryView";
import { ConnectionBadge } from "../../components/ConnectionBadge";
import { QueryChatPane } from "../../components/QueryChat";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { QueryToolbar } from "../../components/WindowToolbar";
import { QueryActionsMenu } from "../../components/QueryActionsMenu";
import { Spinner } from "../../components/LoadingState";
import useElementSize from "../../hooks/useElementSize";
import { useConnectionSwitchGuard } from "../../hooks/useConnectionSwitchGuard";
import { useQueryChat } from "../../hooks/useQueryChat";
import trpc from "../../util/tprc";
import { trpcClient } from "../../GlobalProviders";

export const Route = createFileRoute("/queries/$queryId")({
  component: RouteComponent,
  loader: async ({ params }) => {
    const res = await trpcClient.connections.fetchActiveConnection.query();
    if (!res.connection) throw redirect({ to: "/queries" });
    const result = await trpcClient.queries.fetchQuery.query({
      queryId: params.queryId,
      connectionId: res.connection._id,
    });
    return {
      ...result,
      connectionId: res.connection._id,
      dialect: res.connection.type,
    };
  },
});

type ConnectedQueryData = Extract<
  ReturnType<typeof Route.useLoaderData>,
  { connectionId: string }
>;

function RouteComponent() {
  const data = Route.useLoaderData();
  const { queryId } = Route.useParams();
  if (isSqlQuery(data.query))
    return (
      <CustomSqlQueryEditor
        key={`${queryId}:${data.connectionId}`}
        data={{ ...data, query: data.query }}
        queryId={queryId}
      />
    );
  return (
    <QueryEditor
      key={`${queryId}:${data.connectionId}`}
      data={{ ...data, query: data.query }}
      queryId={queryId}
    />
  );
}

function QueryEditor({
  data,
  queryId,
}: {
  data: Omit<ConnectedQueryData, "query"> & {
    query: Extract<
      ReturnType<typeof Route.useLoaderData>["query"],
      { mode?: "relationship" | undefined }
    >;
  };
  queryId: string;
}) {
  const navigate = useNavigate({ from: "/queries/$queryId" });
  const router = useRouter();
  const utils = trpc.useUtils();
  const [queryHistory, setQueryHistory] = useState<QueryHistory>(
    () => data.query.queryHistory ?? createQueryHistory(data.query),
  );
  const [chatOpen, setChatOpen] = useState(true);
  const [editingNickname, setEditingNickname] = useState(false);
  const [nickname, setNickname] = useState(data.query.nickname);
  const { ref, width, height } = useElementSize();
  const { data: schemaData } = useFetchSchema();
  const unsavedChanges = Boolean(
    schemaData &&
    !queriesMatch(schemaData.schemas, data.query, queryHistory.present.query),
  );
  const chat = useQueryChat({
    queryId,
    connectionId: data.connectionId,
    revision: data.query._rev,
    currentQuery: queryHistory.present.query,
    initialMessages: data.query.chatMessages ?? [],
    onUpsert: async (result) => {
      if (result.queryHistory) setQueryHistory(result.queryHistory);
      await utils.projects.listQueries.invalidate();
      await router.invalidate();
    },
  });
  const deleteQuery = trpc.queries.deleteQuery.useMutation({
    onSuccess: async () => {
      await utils.projects.listQueries.invalidate();
      await navigate({ to: "/queries" });
    },
  });
  const updateQuery = trpc.queries.updateQuery.useMutation({
    onSuccess: async () => {
      await utils.projects.listQueries.invalidate();
      await router.invalidate();
    },
  });
  const updateNickname = trpc.queries.updateQueryNickname.useMutation({
    onSuccess: async () => {
      setEditingNickname(false);
      await router.invalidate();
      await utils.projects.listQueries.invalidate();
    },
  });
  const shouldBlock = () => {
    if (chat.isPending)
      return !confirm(
        "Your query is still being updated. Leave this conversation?",
      );
    if (!unsavedChanges || deleteQuery.isSuccess) return false;
    return !confirm(
      "You have made changes to this query. Are you sure you want to leave without saving?",
    );
  };
  useBlocker({ shouldBlockFn: shouldBlock });
  const switching = useConnectionSwitchGuard(shouldBlock);
  const busy =
    switching ||
    chat.isPending ||
    updateQuery.isPending ||
    updateNickname.isPending ||
    deleteQuery.isPending;
  function handleQueryChange(next: Query) {
    setQueryHistory((history) =>
      schemaData &&
      queriesMatch(schemaData.schemas, history.present.query, next)
        ? history
        : appendQueryVersion(history, next),
    );
  }
  function handleDeleteQuery() {
    if (
      confirm(
        "This will permanently delete this query. Do you want to proceed?",
      )
    )
      deleteQuery.mutate({
        queryId,
        connectionId: data.connectionId,
        revision: data.query._rev,
      });
  }
  const error = updateQuery.error ?? updateNickname.error ?? deleteQuery.error;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <QueryToolbar>
        {editingNickname ? (
          <form
            className="flex min-w-0 flex-1 items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              updateNickname.mutate({
                queryId,
                connectionId: data.connectionId,
                nickname,
                revision: data.query._rev,
              });
            }}
          >
            <Input
              aria-label="Query nickname"
              autoFocus
              disabled={busy}
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
            />
            <Button
              type="submit"
              size="icon"
              aria-label="Save nickname"
              disabled={busy}
            >
              <AiOutlineCheck />
            </Button>
          </form>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <h1
              className="truncate text-sm font-medium"
              title={data.query.nickname}
            >
              {data.query.nickname}
            </h1>
          </div>
        )}
        <div className="flex items-center gap-1">
          <ConnectionBadge />
          <QueryActionsMenu
            disabled={busy}
            onRename={() => {
              setEditingNickname(true);
              setNickname(data.query.nickname);
            }}
            onDelete={handleDeleteQuery}
          />
        </div>
        {unsavedChanges && (
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              updateQuery.mutate({
                queryId,
                connectionId: data.connectionId,
                query: queryHistory.present.query,
                queryHistory,
                revision: data.query._rev,
              })
            }
            aria-busy={updateQuery.isPending}
          >
            {updateQuery.isPending && <Spinner />}Save changes
          </Button>
        )}
      </QueryToolbar>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}
      <div className="flex min-h-0 min-w-0 flex-1">
        <fieldset
          disabled={busy}
          className="min-h-0 min-w-0 flex-1 border-0 p-0"
        >
          <div ref={ref} className="h-full w-full overflow-auto">
            <QueryView
              key={queryId}
              initialQuery={queryHistory.present.query}
              connectionId={data.connectionId}
              filtersetScope={
                data.query.projectId
                  ? { projectId: data.query.projectId, queryId }
                  : undefined
              }
              onConvertToSql={(query) =>
                updateQuery.mutate({
                  connectionId: data.connectionId,
                  queryId,
                  revision: data.query._rev,
                  query,
                })
              }
              onQueryChange={handleQueryChange}
              historyControls={{
                canUndo: queryHistory.past.length > 0,
                canRedo: queryHistory.future.length > 0,
                onUndo: () =>
                  setQueryHistory(
                    (history) => moveQueryHistory(history, "undo") ?? history,
                  ),
                onRedo: () =>
                  setQueryHistory(
                    (history) => moveQueryHistory(history, "redo") ?? history,
                  ),
              }}
              width={width}
              height={height}
            />
          </div>
        </fieldset>
        <QueryChatPane
          collapsed={!chatOpen}
          onToggle={() => setChatOpen((open) => !open)}
          messages={chat.messages}
          pendingMessage={chat.pendingMessage}
          error={chat.error}
          onSend={chat.send}
          draft={chat.draft}
          onDraftChange={chat.setDraft}
          disabled={busy || editingNickname}
        />
      </div>
    </div>
  );
}

function CustomSqlQueryEditor({
  data,
  queryId,
}: {
  data: Omit<ConnectedQueryData, "query"> & {
    query: Extract<
      ReturnType<typeof Route.useLoaderData>["query"],
      { mode: "sql" }
    >;
  };
  queryId: string;
}) {
  const [query, setQuery] = useState<CustomSqlQuery>({
    mode: "sql",
    sql: data.query.sql,
    parameters: data.query.parameters,
    dialect: data.query.dialect ?? data.dialect,
  });
  const [nickname, setNickname] = useState(data.query.nickname);
  const [editingNickname, setEditingNickname] = useState(false);
  const [sqlValid, setSqlValid] = useState(true);
  const router = useRouter();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const dirty =
    query.sql !== data.query.sql ||
    JSON.stringify(query.parameters ?? []) !==
      JSON.stringify(data.query.parameters ?? []);
  const update = trpc.queries.updateQuery.useMutation({
    onSuccess: async () => {
      await router.invalidate();
    },
  });
  const rename = trpc.queries.updateQueryNickname.useMutation({
    onSuccess: async () => {
      setEditingNickname(false);
      await router.invalidate();
      await utils.projects.listQueries.invalidate();
    },
  });
  const remove = trpc.queries.deleteQuery.useMutation({
    onSuccess: async () => {
      await utils.projects.listQueries.invalidate();
      await navigate({ to: "/queries" });
    },
  });
  const shouldBlock = () =>
    dirty &&
    !remove.isSuccess &&
    !confirm("You have unsaved SQL changes. Leave without saving?");
  useBlocker({ shouldBlockFn: shouldBlock });
  const switching = useConnectionSwitchGuard(shouldBlock);
  const busy =
    switching || update.isPending || rename.isPending || remove.isPending;
  const input = {
    connectionId: data.connectionId,
    queryId,
    revision: data.query._rev,
  };
  const error = update.error ?? rename.error ?? remove.error;
  return (
    <div className="flex min-h-full flex-col bg-background">
      <QueryToolbar>
        <span className="rounded-sm border border-primary bg-primary-subtle px-1.5 py-0.5 font-mono text-xs font-medium text-primary-emphasis">
          SQL
        </span>
        {editingNickname ? (
          <form
            className="flex min-w-0 flex-1 items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (nickname.trim() && nickname !== data.query.nickname)
                rename.mutate({ ...input, nickname: nickname.trim() });
            }}
          >
            <Input
              aria-label="Query nickname"
              autoFocus
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              disabled={busy}
            />
            {nickname !== data.query.nickname && (
              <Button
                type="submit"
                size="sm"
                disabled={busy || !nickname.trim()}
              >
                Save nickname
              </Button>
            )}
          </form>
        ) : (
          <h1
            className="min-w-0 flex-1 truncate text-sm font-medium"
            title={data.query.nickname}
          >
            {data.query.nickname}
          </h1>
        )}
        <div className="flex items-center gap-1">
          <ConnectionBadge />
          <QueryActionsMenu
            disabled={busy}
            onRename={() => {
              setNickname(data.query.nickname);
              setEditingNickname(true);
            }}
            onDelete={() => {
              if (confirm("Permanently delete this SQL query?"))
                remove.mutate(input);
            }}
          />
        </div>
        {dirty && (
          <Button
            size="sm"
            disabled={busy || !sqlValid || !query.sql.trim()}
            onClick={() => update.mutate({ ...input, query })}
          >
            {update.isPending && <Spinner />}Save changes
          </Button>
        )}
      </QueryToolbar>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}
      <SqlQueryWorkspace
        connectionId={data.connectionId}
        query={query}
        onChange={setQuery}
        onValidityChange={setSqlValid}
        autoFocus
      />
    </div>
  );
}

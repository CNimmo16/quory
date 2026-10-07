import {
  createFileRoute,
  redirect,
  useNavigate,
  useRouter,
  useBlocker,
} from "@tanstack/react-router";
import { useState } from "react";
import { areQueriesEqual, type PreparedQuery } from "@quory/core";
import { useFetchSchema } from "@quory/stack/react";
import { MessageSquare, SlidersHorizontal } from "lucide-react";
import { TbTrash } from "react-icons/tb";
import { AiFillEdit, AiOutlineCheck } from "react-icons/ai";
import QueryView from "../../components/QueryView";
import { QueryChatPane } from "../../components/QueryChat";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Hint } from "../../components/Hint";
import { Spinner } from "../../components/LoadingState";
import useElementSize from "../../hooks/useElementSize";
import useMainDimensions from "../../hooks/useMainDimensions";
import { useQueryChat } from "../../hooks/useQueryChat";
import trpc from "../../util/tprc";
import { trpcClient } from "../../GlobalProviders";

export const Route = createFileRoute("/queries/$queryId")({
  component: RouteComponent,
  loader: async ({ params }) => {
    const res = await trpcClient.connections.fetchActiveConnection.query();
    if (!res.connection) throw redirect({ to: "/connections" });
    return trpcClient.queries.fetchQuery.query({ queryId: params.queryId });
  },
});

function RouteComponent() {
  const data = Route.useLoaderData();
  const { queryId } = Route.useParams();
  return <QueryEditor key={queryId} data={data} queryId={queryId} />;
}

function QueryEditor({
  data,
  queryId,
}: {
  data: ReturnType<typeof Route.useLoaderData>;
  queryId: string;
}) {
  const navigate = useNavigate({ from: "/queries/$queryId" });
  const router = useRouter();
  const utils = trpc.useUtils();
  const [query, setQuery] = useState<PreparedQuery | null>(null);
  const [viewVersion, setViewVersion] = useState(0);
  const [chatOpen, setChatOpen] = useState(
    Boolean(data.query.chatMessages?.length)
  );
  const [editingNickname, setEditingNickname] = useState(false);
  const [nickname, setNickname] = useState(data.query.nickname);
  const { ref, width, height } = useElementSize();
  const compact = (useMainDimensions()?.width ?? 900) < 720;
  const { data: schemaData } = useFetchSchema();
  const unsavedChanges = Boolean(
    schemaData &&
      !areQueriesEqual(schemaData.schemas, data.query, query ?? data.query)
  );
  const chat = useQueryChat({
    queryId,
    revision: data.query._rev,
    currentQuery: query ?? data.query,
    initialMessages: data.query.chatMessages ?? [],
    onUpsert: async () => {
      await utils.queries.listSavedQueries.invalidate();
      await router.invalidate();
      setQuery(null);
      setViewVersion((version) => version + 1);
    },
  });
  const deleteQuery = trpc.queries.deleteQuery.useMutation({
    onSuccess: async () => {
      await utils.queries.listSavedQueries.invalidate();
      await navigate({ to: "/queries" });
    },
  });
  const updateQuery = trpc.queries.updateQuery.useMutation({
    onSuccess: async () => {
      await router.invalidate();
      setQuery(null);
      setViewVersion((version) => version + 1);
    },
  });
  const updateNickname = trpc.queries.updateQueryNickname.useMutation({
    onSuccess: async () => {
      setEditingNickname(false);
      await router.invalidate();
      await utils.queries.listSavedQueries.invalidate();
    },
  });
  const busy =
    chat.isPending ||
    updateQuery.isPending ||
    updateNickname.isPending ||
    deleteQuery.isPending;
  useBlocker({
    shouldBlockFn: () => {
      if (chat.isPending)
        return !confirm(
          "Your query is still being updated. Leave this conversation?"
        );
      if (!unsavedChanges || deleteQuery.isSuccess) return false;
      return !confirm(
        "You have made changes to this query. Are you sure you want to leave without saving?"
      );
    },
  });
  function handleDeleteQuery() {
    if (
      confirm(
        "This will permanently delete this query. Do you want to proceed?"
      )
    )
      deleteQuery.mutate({ queryId });
  }
  const error = updateQuery.error ?? updateNickname.error ?? deleteQuery.error;
  return (
    <div className={`flex h-full min-h-0 ${compact ? "flex-col" : ""}`}>
      {chatOpen && (
        <QueryChatPane
          compact={compact}
          messages={chat.messages}
          pendingMessage={chat.pendingMessage}
          error={chat.error}
          onSend={chat.send}
          draft={chat.draft}
          onDraftChange={chat.setDraft}
          disabled={busy || editingNickname}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <fieldset disabled={busy} className="min-w-0 border-0 p-0">
          <div className="flex min-h-16 flex-wrap items-center gap-2 border-b bg-background px-4 py-3">
            {editingNickname ? (
              <form
                className="flex min-w-0 flex-1 items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  updateNickname.mutate({
                    queryId,
                    nickname,
                    revision: data.query._rev,
                  });
                }}
              >
                <Input
                  aria-label="Query nickname"
                  autoFocus
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                />
                <Button type="submit" size="icon" aria-label="Save nickname">
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
                <Hint content="Edit nickname">
                  <Button
                    size="icon"
                    aria-label="Edit nickname"
                    variant="ghost"
                    onClick={() => {
                      setEditingNickname(true);
                      setNickname(data.query.nickname);
                    }}
                  >
                    <AiFillEdit />
                  </Button>
                </Hint>
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setChatOpen(!chatOpen)}
            >
              {chatOpen ? (
                <SlidersHorizontal aria-hidden="true" />
              ) : (
                <MessageSquare aria-hidden="true" />
              )}
              {chatOpen ? "Manual mode" : "Chat mode"}
            </Button>
            {unsavedChanges && (
              <Button
                size="sm"
                onClick={() =>
                  query &&
                  updateQuery.mutate({
                    queryId,
                    query,
                    revision: data.query._rev,
                  })
                }
                aria-busy={updateQuery.isPending}
              >
                {updateQuery.isPending && <Spinner />}Save changes
              </Button>
            )}
            <Hint content="Delete query">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete query"
                onClick={handleDeleteQuery}
              >
                <TbTrash aria-hidden="true" />
              </Button>
            </Hint>
          </div>
        </fieldset>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}
        <fieldset
          disabled={busy}
          className="min-h-0 min-w-0 flex-1 border-0 p-0"
        >
          <div ref={ref} className="h-full w-full overflow-auto">
            <QueryView
              key={`${queryId}:${viewVersion}`}
              initialQuery={data.query}
              onQueryChange={setQuery}
              onDeleteQuery={handleDeleteQuery}
              width={width}
              height={height}
            />
          </div>
        </fieldset>
      </div>
    </div>
  );
}

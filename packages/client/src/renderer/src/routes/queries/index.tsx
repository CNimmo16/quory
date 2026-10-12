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
import { QueryChatPane, QueryComposer } from "../../components/QueryChat";
import { useQueryChat } from "../../hooks/useQueryChat";
import { MessageSquare, SlidersHorizontal, Sparkles } from "lucide-react";

export const Route = createFileRoute("/queries/")({
  component: RouteComponent,
  loader: async () => {
    const res = await trpcClient.connections.fetchActiveConnection.query();
    if (!res.connection) {
      throw redirect({ to: "/connections" });
    }
    return { connectionId: res.connection._id };
  },
});

function RouteComponent() {
  const { connectionId } = Route.useLoaderData();
  return <QueryLaunch key={connectionId} connectionId={connectionId} />;
}

function QueryLaunch({ connectionId }: { connectionId: string }) {
  const compact = (useMainDimensions()?.width ?? 900) < 720;
  const [manual, setManual] = useState(false);
  const [started, setStarted] = useState(false);
  const navigate = useNavigate({ from: "/queries" });
  const utils = trpc.useUtils();
  const chat = useQueryChat({
    connectionId,
    onUpsert: async ({ queryId }) => {
      await utils.queries.listSavedQueries.invalidate();
      if (queryId)
        await navigate({ to: "/queries/$queryId", params: { queryId } });
    },
  });
  return (
    <div className={`flex h-full min-h-0 ${compact ? "flex-col" : ""}`}>
      {started && !manual && (
        <QueryChatPane
          compact={compact}
          messages={chat.messages}
          pendingMessage={chat.pendingMessage}
          error={chat.error}
          onSend={chat.send}
          draft={chat.draft}
          onDraftChange={chat.setDraft}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-16 shrink-0 items-center justify-between px-6">
          <span className="text-sm font-medium text-muted-foreground">
            New query
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={chat.isPending}
            onClick={() => setManual(!manual)}
          >
            {manual ? (
              <MessageSquare aria-hidden="true" />
            ) : (
              <SlidersHorizontal aria-hidden="true" />
            )}
            {manual ? "Describe a query" : "Manual mode"}
          </Button>
        </div>
        {manual ? (
          <ManualQueryForm connectionId={connectionId} />
        ) : started ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <MessageSquare
              className="size-8 text-muted-foreground"
              aria-hidden="true"
            />
            <h1 className="text-xl font-semibold">
              {chat.isPending
                ? "Finding the right query"
                : chat.error
                ? "Your query hasn’t been created yet"
                : "Let’s clarify your query"}
            </h1>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
              {chat.isPending
                ? "Matching your request to the tables and relationships in your database."
                : chat.error
                ? "Try again in the chat, or choose manual mode to build your query."
                : "Answer in the chat to help Quory choose the right tables and columns. Your results will appear here."}
            </p>
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-8 pb-24">
            <div className="space-y-3">
              <Sparkles className="size-7 text-primary" aria-hidden="true" />
              <h1 className="text-3xl font-semibold tracking-tight">
                What would you like to explore?
              </h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Describe an entity and the related information you need. Quory
                will use your database schema to build a query, and ask if
                anything is unclear.
              </p>
            </div>
            <QueryComposer
              initial
              onSend={(message) => {
                setStarted(true);
                return chat.send(message);
              }}
              pending={chat.isPending}
              draft={chat.draft}
              onDraftChange={chat.setDraft}
            />
            {chat.error && (
              <Alert variant="destructive">
                <AlertDescription>{chat.error}</AlertDescription>
              </Alert>
            )}
            <p className="text-xs leading-relaxed text-muted-foreground">
              Your request and database schema are shared with your configured
              AI provider. Row data stays in Quory.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ManualQueryForm({ connectionId }: { connectionId: string }) {
  const { data: schemaData } = useFetchSchema();

  const { height: mainHeight } = useMainDimensions()!;

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
          connectionId,
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
        className="mx-auto w-full max-w-3xl px-6 pt-16"
        style={{
          minHeight: Math.max(0, mainHeight - 200),
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

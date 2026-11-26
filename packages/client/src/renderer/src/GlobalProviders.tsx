import {
  QuoryProvider,
  JoinRankingProvider,
  type JoinRanker,
} from "@quory/stack/react";
import { useMemo } from "react";
import { TooltipProvider } from "./components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { SidebarLayoutProvider } from "./hooks/useSidebarLayout";
import trpc from "./util/tprc";
import { queryClient, trpcClient } from "./util/trpcClient";
import { NewQueryDraftProvider } from "./hooks/useNewQueryDraft";
import {
  SettingsProvider,
  useAppSettings,
} from "./components/SettingsProvider";

export default function GlobalProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <SettingsProvider>
          <NewQueryDraftProvider>
            <SidebarLayoutProvider>
              <ConnectedQuoryProvider>{children}</ConnectedQuoryProvider>
            </SidebarLayoutProvider>
          </NewQueryDraftProvider>
        </SettingsProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}

function ConnectedQuoryProvider({ children }: { children: React.ReactNode }) {
  const { data: activeConnection } =
    trpc.connections.fetchActiveConnection.useQuery();
  const connection = activeConnection?.connection;
  const settings = useAppSettings();
  const ai = settings?.data?.ai;
  const ranker = useMemo<JoinRanker | undefined>(() => {
    if (!ai?.decision) return undefined;
    return async (request, signal) => {
      signal?.throwIfAborted();
      // Scope cached decisions to the connection, settings revision and complete
      // candidate metadata. Never use row data or credential contents as keys.
      const result = await queryClient.fetchQuery({
        queryKey: [
          "join-ranking",
          connection?._id,
          connection?._rev,
          settings?.dataUpdatedAt,
          ai.decision,
          request,
        ],
        queryFn: ({ signal: querySignal }) =>
          trpcClient.joinRanking.rank.query(request, { signal: querySignal }),
        staleTime: (query) => (query.state.data?.ranked ? 5 * 60_000 : 15_000),
        gcTime: 10 * 60_000,
        retry: false,
      });
      signal?.throwIfAborted();
      return result;
    };
  }, [ai, connection?._id, connection?._rev, settings?.dataUpdatedAt]);
  return (
    <QuoryProvider
      key={connection ? `${connection._id}:${connection._rev}` : "disconnected"}
      fetchFn={async (path, data, signal) => {
        const invoke = (body: { path: string; data?: unknown }) =>
          api.quory({ ...body, connectionId: connection?._id });
        if (path !== "query" && path !== "queryCount")
          return invoke({ path, data });
        const executionId = crypto.randomUUID();
        const cancel = () => {
          void invoke({ path: "cancelQuery", data: { executionId } }).catch(
            () => {},
          );
        };
        signal?.throwIfAborted();
        signal?.addEventListener("abort", cancel, { once: true });
        try {
          return await invoke({
            path,
            data: { ...(data as object), executionId },
          });
        } finally {
          signal?.removeEventListener("abort", cancel);
        }
      }}
    >
      <JoinRankingProvider value={ranker}>
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
      </JoinRankingProvider>
    </QuoryProvider>
  );
}

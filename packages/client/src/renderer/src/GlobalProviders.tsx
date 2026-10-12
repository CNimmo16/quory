import { QuoryProvider } from "@quory/stack/react";
import { TooltipProvider } from "./components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ipcLink } from "trpc-electron/renderer";
import trpc from "./util/tprc";

export const trpcClient = trpc.createClient({
  links: [ipcLink()],
});

const queryClient = new QueryClient();

export default function GlobalProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <ConnectedQuoryProvider>{children}</ConnectedQuoryProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}

function ConnectedQuoryProvider({ children }: { children: React.ReactNode }) {
  const { data: activeConnection } =
    trpc.connections.fetchActiveConnection.useQuery();
  const connection = activeConnection?.connection;
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
            () => {}
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
      <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
    </QuoryProvider>
  );
}

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
  const { data } = trpc.connections.fetchActiveConnection.useQuery();
  const connection = data?.connection;
  return (
    <QuoryProvider
      key={connection ? `${connection._id}:${connection._rev}` : "disconnected"}
      fetchFn={async (path, requestData) =>
        api.quory({ path, data: requestData })
      }
    >
      <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
    </QuoryProvider>
  );
}

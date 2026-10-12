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
        <QuoryProvider
          fetchFn={async (path, data, signal) => {
            if (path !== "query" && path !== "queryCount")
              return api.quory({ path, data });
            const executionId = crypto.randomUUID();
            const cancel = () => {
              void api
                .quory({ path: "cancelQuery", data: { executionId } })
                .catch(() => {});
            };
            signal?.throwIfAborted();
            signal?.addEventListener("abort", cancel, { once: true });
            try {
              return await api.quory({
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
      </QueryClientProvider>
    </trpc.Provider>
  );
}

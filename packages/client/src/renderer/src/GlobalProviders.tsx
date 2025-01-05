import { QuoryProvider } from "@quory/stack/react";
import { createTheme, MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ipcLink } from "trpc-electron/renderer";
import trpc from "./util/tprc";

const mantineTheme = createTheme({
  fontFamily: "Montserrat, sans-serif",
  defaultRadius: "md",
});

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
          fetchFn={async (path, data) => {
            console.info("FETCHING", path, data);
            return api.quory({ path, data });
          }}
        >
          <MantineProvider theme={mantineTheme}>{children}</MantineProvider>
        </QuoryProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}

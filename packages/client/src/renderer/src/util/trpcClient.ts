import { QueryClient } from "@tanstack/react-query";
import { ipcLink } from "trpc-electron/renderer";
import trpc from "./tprc";

// These instances are shared by providers and route loaders. Keeping them out
// of component modules lets those components refresh without replacing clients.
export const trpcClient = trpc.createClient({ links: [ipcLink()] });
export const queryClient = new QueryClient();

import { createContext } from "react";
import type { QueryClient } from "@tanstack/react-query";

interface QuoryCtxValue {
  queryClient: QueryClient;
}

// Keep the context outside component modules so Fast Refresh of a provider or
// consumer does not create a different context for the mounted tree.
export const QuoryContext = createContext<QuoryCtxValue | null>(null);

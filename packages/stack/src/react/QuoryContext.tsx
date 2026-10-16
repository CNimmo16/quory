import { createContext, ReactNode, useMemo } from "react";
import { QueryClient, QueryFunction } from "@tanstack/react-query";

interface QuoryCtxValue {
  queryClient: QueryClient;
}

export const QuoryContext = createContext<QuoryCtxValue | null>(null);

export type QuoryProviderConfig =
  | {
      endpointUrl: string;
    }
  | {
      fetchFn: (
        path: string,
        requestData?: unknown,
        signal?: AbortSignal,
      ) => Promise<unknown>;
    };

export function QuoryProvider(
  props: {
    children: ReactNode;
  } & QuoryProviderConfig,
) {
  const fetchFn = useMemo((): QueryFunction => {
    return async ({ queryKey, signal }) => {
      const [path, requestData] = queryKey;
      if (typeof path !== "string") {
        throw new Error("path must be a string");
      }
      if ("endpointUrl" in props) {
        const executionId = crypto.randomUUID();
        const cancellable = path === "query" || path === "queryCount";
        const dispatch = (
          route: string,
          data: unknown,
          requestSignal?: AbortSignal,
        ) =>
          fetch(props.endpointUrl, {
            method: "POST",
            ...(requestSignal && { signal: requestSignal }),
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: route, data }),
          });
        const cancel = () => {
          void dispatch("cancelQuery", { executionId }).catch(() => {});
        };
        if (cancellable)
          signal.addEventListener("abort", cancel, { once: true });
        try {
          signal.throwIfAborted();
          const response = await dispatch(
            path,
            cancellable
              ? { ...(requestData as object), executionId }
              : requestData,
            signal,
          );
          if (!response.ok) throw new Error(response.statusText);
          return response.json();
        } finally {
          signal.removeEventListener("abort", cancel);
        }
      } else {
        return props.fetchFn(path, requestData, signal);
      }
    };
  }, [props]);

  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            queryFn: fetchFn,
          },
        },
      }),
    [fetchFn],
  );

  return (
    <QuoryContext.Provider value={{ queryClient }}>
      {props.children}
    </QuoryContext.Provider>
  );
}

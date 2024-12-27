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
      fetchFn: (path: string, requestData?: unknown) => Promise<unknown>;
    };

export function QuoryProvider(
  props: {
    children: ReactNode;
  } & QuoryProviderConfig
) {
  const fetchFn = useMemo((): QueryFunction => {
    return async ({ queryKey }) => {
      const [path, requestData] = queryKey;
      if (typeof path !== "string") {
        throw new Error("path must be a string");
      }
      if ("endpointUrl" in props) {
        const response = await fetch(props.endpointUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            path,
            data: requestData,
          }),
        });
        if (!response.ok) {
          throw new Error(response.statusText);
        }
        return response.json();
      } else {
        return props.fetchFn(path, requestData);
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
    [fetchFn]
  );

  return (
    <QuoryContext.Provider value={{ queryClient }}>
      {props.children}
    </QuoryContext.Provider>
  );
}

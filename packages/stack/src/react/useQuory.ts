import { useQuery, UseQueryOptions } from "@tanstack/react-query";
import {
  RouterRequest,
  RouterResponse,
  type RouterPath,
} from "../server/routes";
import { useContext, useId } from "react";
import { QuoryContext } from "./QuoryContext";

export default function useQuory<P extends RouterPath>(
  path: P,
  requestData: RouterRequest<P> | null,
  args?:
    | Omit<
        UseQueryOptions<RouterResponse<P>>,
        "queryFn" | "queryKey" | "enabled"
      >
    | undefined,
  options: {
    isolatedCache: boolean;
  } = {
    isolatedCache: false,
  }
) {
  const ctx = useContext(QuoryContext);

  if (!ctx) {
    throw new Error("useQuory must be used within a QuoryProvider");
  }

  const uniqueId = useId();

  const queryKey = [path, requestData];
  if (options.isolatedCache) {
    queryKey.push(uniqueId);
  }

  return useQuery<RouterResponse<P>>(
    {
      queryKey,
      enabled: requestData !== null,
      retry: false,
      ...args,
    },
    ctx.queryClient
  );
}

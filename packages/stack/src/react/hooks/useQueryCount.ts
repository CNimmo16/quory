import { RouterRequest } from "../../server/routes";
import useQuory from "../useQuory";

export default function useQueryCount(
  query: RouterRequest<"queryCount">["query"] | null
) {
  const { data, isFetching, error } = useQuory(
    "queryCount",
    query
      ? {
          query,
        }
      : null
  );

  return {
    count: data?.count ?? null,
    query: data?.preparedQuery,
    isLoading: isFetching,
    error,
  };
}

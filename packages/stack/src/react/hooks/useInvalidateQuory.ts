import { useCallback, useContext } from "react";
import { QuoryContext } from "../QuoryContext";

export function useInvalidateQuory() {
  const context = useContext(QuoryContext);
  return useCallback(async () => {
    await context?.queryClient.invalidateQueries();
  }, [context]);
}

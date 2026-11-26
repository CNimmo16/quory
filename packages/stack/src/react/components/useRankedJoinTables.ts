import { useEffect, useRef, useState } from "react";
import {
  useJoinRanker,
  type JoinRanker,
  type JoinRankingRequest,
} from "../JoinRankingContext";
import { rankJoinTables } from "./joinTableRanking";

export function useRankedJoinTables(request: JoinRankingRequest) {
  const ranker = useJoinRanker();
  const key = JSON.stringify(request);
  const [result, setResult] = useState<{
    key: string;
    ids: string[];
    ranker: JoinRanker;
  }>();
  const activeRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!ranker || request.candidates.length <= 1) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    void rankJoinTables(ranker, request, controller.signal).then((ids) => {
      if (!controller.signal.aborted) setResult({ key, ids, ranker });
    });
    return () => controller.abort();
    // The serialized schema request is the identity; rendering/search must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ranker, key]);
  const pending = Boolean(
    ranker &&
    request.candidates.length > 1 &&
    (result?.key !== key || result.ranker !== ranker),
  );
  return {
    pending,
    useLocal: () => {
      activeRequest.current?.abort();
      if (ranker) setResult({ key, ids: [], ranker });
    },
    orderedIds:
      result?.key === key && result.ranker === ranker ? result.ids : [],
  };
}

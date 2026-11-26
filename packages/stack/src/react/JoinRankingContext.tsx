import { createContext, useContext } from "react";

/** Schema metadata only: never include row values, SQL, or filter literals. */
export type JoinRankingRequest = {
  kind: "tables" | "paths" | "columns";
  sourceTable: string;
  targetTable?: string;
  joinedTables: string[];
  selectedColumns?: { tableRef: string; columns: string[] }[];
  joinPath?: string;
  candidates: { id: string; description: string }[];
};

export type JoinRankingResult = {
  orderedIds: string[];
  ranked: boolean;
  selectedIds?: string[];
};

/** At most 32 locally shortlisted candidates per request. Omit to use local suggestions. */
export type JoinRanker = (
  request: JoinRankingRequest,
  signal?: AbortSignal,
) => Promise<JoinRankingResult>;

const JoinRankingContext = createContext<JoinRanker | undefined>(undefined);
export const JoinRankingProvider = JoinRankingContext.Provider;
export const useJoinRanker = () => useContext(JoinRankingContext);

import { areQueriesEqual, type DatabaseSchema, type Query } from "@quory/core";

export type QueryVersion = { query: Query; messageId?: string | undefined };
export type QueryHistory = {
  past: QueryVersion[];
  present: QueryVersion;
  future: QueryVersion[];
};
export type QueryHistoryAction = "undo" | "redo";

export const QUERY_HISTORY_LIMIT = 50;

export function querySnapshot(query: Query): Query {
  // Keep query state only, never saved-document metadata or history itself.
  return {
    base: structuredClone(query.base),
    limit: Math.min(query.limit ?? 100, 100),
    offset: query.offset ?? 0,
  };
}

export function createQueryHistory(query: Query): QueryHistory {
  return { past: [], present: { query: querySnapshot(query) }, future: [] };
}

export function queriesMatch(schemas: DatabaseSchema[], a: Query, b: Query) {
  // Compare both directions so adding or removing a join is always a change.
  return areQueriesEqual(schemas, a, b) && areQueriesEqual(schemas, b, a);
}

export function appendQueryVersion(
  history: QueryHistory,
  query: Query,
  messageId?: string
): QueryHistory {
  return {
    past: [...history.past, history.present].slice(-QUERY_HISTORY_LIMIT),
    present: {
      query: querySnapshot(query),
      ...(messageId ? { messageId } : {}),
    },
    future: [],
  };
}

export function moveQueryHistory(
  history: QueryHistory,
  action: QueryHistoryAction
): QueryHistory | null {
  if (action === "undo") {
    const previous = history.past.at(-1);
    if (!previous) return null;
    return {
      past: history.past.slice(0, -1),
      present: previous,
      future: [history.present, ...history.future].slice(
        0,
        QUERY_HISTORY_LIMIT
      ),
    };
  }
  const next = history.future[0];
  if (!next) return null;
  return {
    past: [...history.past, history.present].slice(-QUERY_HISTORY_LIMIT),
    present: next,
    future: history.future.slice(1),
  };
}

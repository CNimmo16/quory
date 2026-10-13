import { expect, it } from "vitest";
import { schemas } from "../../test/queryFixtures";
import {
  appendQueryVersion,
  createQueryHistory,
  moveQueryHistory,
  queriesMatch,
  QUERY_HISTORY_LIMIT,
} from "./queryHistory";

const query = {
  base: { tableRef: "public.orders", select: "*" as const },
  limit: 100,
};

it("keeps independent bounded snapshots and drops redo when a new change branches from an undo", () => {
  let history = createQueryHistory(query);
  for (let limit = 1; limit <= 60; limit++)
    history = appendQueryVersion(history, { ...query, limit });
  expect(history.past).toHaveLength(QUERY_HISTORY_LIMIT);
  const undone = moveQueryHistory(history, "undo")!;
  expect(undone.present.query.limit).toBe(59);
  expect(moveQueryHistory(undone, "redo")).toEqual(history);
  const next = { ...query, base: { ...query.base }, limit: 10 };
  const branched = appendQueryVersion(undone, next);
  next.base.tableRef = "public.users";
  expect(branched.present.query.base.tableRef).toBe("public.orders");
  expect(branched.future).toEqual([]);
  expect(moveQueryHistory(branched, "redo")).toBeNull();
});

it("recognizes added joins as changes and ignores query preparation metadata", () => {
  const joined = {
    ...query,
    base: {
      ...query.base,
      joins: [{ tableRef: "public.users", select: "*" as const }],
    },
  };
  expect(queriesMatch(schemas, query, joined)).toBe(false);
  expect(queriesMatch(schemas, joined, query)).toBe(false);
  expect(queriesMatch(schemas, query, { ...query, offset: 0 })).toBe(true);
});

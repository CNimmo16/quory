import { beforeEach, expect, it, vi } from "vitest";
import type { SavedQuery } from "../repositories/queryRepo";
const mocks = vi.hoisted(() => ({
  active: "a",
  generation: 0,
  get: vi.fn(),
  put: vi.fn(),
  remove: vi.fn(),
  allDocs: vi.fn(),
}));
vi.mock("../repositories/queryRepo", () => ({ queryRepo: mocks }));
vi.mock("../state/activeConnectionState", () => ({
  default: {
    getActiveConnectionId: async () => mocks.active,
    getConnectionGeneration: () => mocks.generation,
  },
}));
vi.mock("../ai/queryChat", async () => {
  const { publicProcedure } = await import("../util/trpc");
  return { queryChatProcedure: publicProcedure.mutation(() => {}) };
});
import queryRouter from "./queryRouter";
const caller = queryRouter.createCaller({});
const query = {
  base: { tableRef: "public.orders", select: "*" as const, joins: [] },
  limit: 100,
};
let docs: Map<string, SavedQuery & { _id: string; _rev: string }>;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.active = "a";
  mocks.generation = 0;
  docs = new Map();
  mocks.get.mockImplementation(async (id) => {
    if (!docs.has(id)) throw { status: 404 };
    return structuredClone(docs.get(id));
  });
  mocks.put.mockImplementation(async (doc) => {
    if (docs.get(doc._id)?._rev !== doc._rev) throw { status: 409 };
    const rev = `${Number(doc._rev?.split("-")[0] ?? 0) + 1}-saved`;
    docs.set(doc._id, structuredClone({ ...doc, _rev: rev }));
    return { rev };
  });
  mocks.remove.mockImplementation(async (doc) => {
    if (docs.get(doc._id)?._rev !== doc._rev) throw { status: 409 };
    docs.delete(doc._id);
  });
  mocks.allDocs.mockImplementation(async () => ({
    rows: [...docs].map(([id, doc]) => ({ id, doc })),
  }));
});
async function create() {
  const { queryId } = await caller.createQuery({ connectionId: "a", query });
  return queryId;
}
it("supports create, fetch, list, edit, rename and delete without changing ownership", async () => {
  const queryId = await create();
  const { query: saved } = await caller.fetchQuery({
    connectionId: "a",
    queryId,
  });
  expect(
    (await caller.listSavedQueries({ connectionId: "a" })).queries.map(
      (q) => q.id
    )
  ).toEqual([queryId]);
  const updated = await caller.updateQuery({
    connectionId: "a",
    queryId,
    revision: saved._rev,
    query: { ...query, limit: 7 },
  });
  const renamed = await caller.updateQueryNickname({
    connectionId: "a",
    queryId,
    revision: updated.revision,
    nickname: "Renamed",
  });
  expect(docs.get(queryId)).toMatchObject({
    connectionId: "a",
    nickname: "Renamed",
    limit: 7,
  });
  await caller.deleteQuery({
    connectionId: "a",
    queryId,
    revision: renamed.revision,
  });
  expect(docs.size).toBe(0);
});
it("rejects wrong-connection fetch, edit, rename and delete before any write", async () => {
  const queryId = await create();
  mocks.active = "b";
  mocks.put.mockClear();
  const input = { connectionId: "b", queryId, revision: "1-saved" };
  for (const operation of [
    () => caller.fetchQuery(input),
    () => caller.updateQuery({ ...input, query }),
    () => caller.updateQueryNickname({ ...input, nickname: "Stolen" }),
    () => caller.deleteQuery(input),
  ])
    await expect(operation()).rejects.toThrow("different connection");
  expect(
    (await caller.listSavedQueries({ connectionId: "b" })).queries
  ).toEqual([]);
  expect(mocks.put).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(docs.get(queryId)?.connectionId).toBe("a");
});
it("rejects stale revisions for edits, renames and deletes", async () => {
  const queryId = await create();
  const input = { connectionId: "a", queryId, revision: "stale" };
  for (const operation of [
    () => caller.updateQuery({ ...input, query }),
    () => caller.updateQueryNickname({ ...input, nickname: "Old" }),
    () => caller.deleteQuery(input),
  ])
    await expect(operation()).rejects.toMatchObject({ code: "CONFLICT" });
  expect(docs.get(queryId)?._rev).toBe("1-saved");
});
it("rejects stale renderer context for create and fetch", async () => {
  const queryId = await create();
  mocks.active = "b";
  mocks.get.mockClear();
  await expect(
    caller.createQuery({ connectionId: "a", query })
  ).rejects.toThrow("active connection changed");
  await expect(
    caller.fetchQuery({ connectionId: "a", queryId })
  ).rejects.toThrow("active connection changed");
  expect(mocks.get).not.toHaveBeenCalled();
  expect(docs.size).toBe(1);
});
it.each(["fetch", "update", "rename", "delete", "list"] as const)(
  "rejects a switch away and back during %s",
  async (operation) => {
    const queryId = await create();
    const switchConnection = () => {
      mocks.generation += 2;
    };
    const get = mocks.get.getMockImplementation()!;
    mocks.get.mockImplementation(async (id) => {
      const doc = await get(id);
      switchConnection();
      return doc;
    });
    const all = mocks.allDocs.getMockImplementation()!;
    mocks.allDocs.mockImplementation(async () => {
      const rows = await all();
      switchConnection();
      return rows;
    });
    mocks.put.mockClear();
    const input = { connectionId: "a", queryId, revision: "1-saved" };
    const operations = {
      fetch: () => caller.fetchQuery(input),
      update: () => caller.updateQuery({ ...input, query }),
      rename: () => caller.updateQueryNickname({ ...input, nickname: "Old" }),
      delete: () => caller.deleteQuery(input),
      list: () => caller.listSavedQueries(input),
    };
    await expect(operations[operation]()).rejects.toThrow(
      "active connection changed"
    );
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  }
);

it.each(["update", "rename", "delete"] as const)(
  "preserves a concurrent edit made after the %s ownership read",
  async (operation) => {
    const queryId = await create();
    const get = mocks.get.getMockImplementation()!;
    mocks.get.mockImplementation(async (id) => {
      const snapshot = await get(id);
      docs.get(id)!._rev = "2-concurrent";
      docs.get(id)!.nickname = "Concurrent edit";
      return snapshot;
    });
    const input = { connectionId: "a", queryId, revision: "1-saved" };
    const operations = {
      update: () => caller.updateQuery({ ...input, query }),
      rename: () => caller.updateQueryNickname({ ...input, nickname: "Old" }),
      delete: () => caller.deleteQuery(input),
    };
    await expect(operations[operation]()).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(docs.get(queryId)).toMatchObject({
      _rev: "2-concurrent",
      nickname: "Concurrent edit",
    });
  }
);

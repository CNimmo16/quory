import { beforeEach, expect, it, vi } from "vitest";
import type { SavedQuery } from "../repositories/queryRepo";
import {
  appendQueryVersion,
  createQueryHistory,
  type QueryHistoryAction,
} from "../../shared/queryHistory";
const mocks = vi.hoisted(() => ({
  active: "a",
  generation: 0,
  project: "a",
  projectGeneration: 0,
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
vi.mock("../state/activeProjectState", async () => {
  const { TRPCError } = await import("@trpc/server");
  return {
    activeProjectState: {
      requireActiveProject: () => ({
        _id: mocks.project,
        _rev: "1-project",
        name: "Test project",
        storage: "database",
      }),
      getProjectGeneration: () => mocks.projectGeneration,
      assertCurrent: (id: string, generation: number) => {
        if (id !== mocks.project || generation !== mocks.projectGeneration)
          throw new TRPCError({
            code: "CONFLICT",
            message: "The active project changed.",
          });
      },
    },
  };
});
vi.mock("./sqlProcedures", () => ({ sqlProcedures: {} }));
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
  mocks.project = "a";
  mocks.projectGeneration = 0;
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

it("lists project queries while disconnected without exposing another project's queries", async () => {
  const queryId = await create();
  mocks.active = "";
  ++mocks.generation;
  expect(
    (await caller.listSavedQueries({ projectId: "a" })).queries.map(
      ({ id }) => id,
    ),
  ).toEqual([queryId]);
  await expect(caller.listSavedQueries({ projectId: "b" })).rejects.toThrow(
    "project changed",
  );
});

it("rejects a project-only list if the project changes during the read", async () => {
  await create();
  mocks.allDocs.mockImplementationOnce(async () => {
    ++mocks.projectGeneration;
    return { rows: [...docs].map(([id, doc]) => ({ id, doc })) };
  });
  await expect(caller.listSavedQueries({ projectId: "a" })).rejects.toThrow(
    "project changed",
  );
});
function historyInput(queryId: string, action: QueryHistoryAction = "undo") {
  const doc = docs.get(queryId)!;
  return {
    connectionId: "a",
    queryId,
    revision: doc._rev,
    action,
    queryHistory: doc.queryHistory!,
    messages: (doc.chatMessages ?? []).slice(-60),
  };
}
it("persists undo and redo without removing the chat that caused the change", async () => {
  const queryId = await create();
  const changed = { ...query, limit: 7 };
  const history = appendQueryVersion(
    docs.get(queryId)!.queryHistory!,
    changed,
    "reply",
  );
  const messages = [
    { id: "request", role: "user" as const, content: "Only seven rows" },
    {
      id: "reply",
      role: "assistant" as const,
      content: "Showing seven rows.",
      queryUpdated: true,
    },
  ];
  await caller.updateQuery({
    connectionId: "a",
    queryId,
    revision: "1-saved",
    query: changed,
    queryHistory: history,
  });
  docs.get(queryId)!.chatMessages = messages;
  const undone = await caller.changeQueryHistory(historyInput(queryId));
  expect(docs.get(queryId)).toMatchObject({
    limit: 100,
    chatMessages: expect.arrayContaining(messages),
  });
  expect(undone.messages.at(-1)).toMatchObject({
    historyAction: "undo",
    relatedMessageId: "reply",
  });
  expect(undone.messages.at(-1)?.content).toContain("Showing seven rows.");
  const reopened = await caller.fetchQuery({ connectionId: "a", queryId });
  expect(reopened.query.queryHistory?.future).toHaveLength(1);
  const redone = await caller.changeQueryHistory(historyInput(queryId, "redo"));
  expect(docs.get(queryId)?.limit).toBe(7);
  expect(redone.messages.slice(0, 2)).toEqual(messages);
  expect(redone.messages.at(-1)).toMatchObject({
    historyAction: "redo",
    relatedMessageId: "reply",
  });
  expect(redone.queryHistory.future).toEqual([]);
});

it("retains older chat messages when undo appends to a truncated agent context", async () => {
  const queryId = await create();
  docs.get(queryId)!.chatMessages = Array.from({ length: 70 }, (_, i) => ({
    id: String(i),
    role: "user" as const,
    content: `Message ${i}`,
  }));
  await caller.updateQuery({
    connectionId: "a",
    queryId,
    revision: "1-saved",
    query: { ...query, limit: 7 },
  });
  const undone = await caller.changeQueryHistory(historyInput(queryId));
  expect(undone.messages).toHaveLength(71);
  expect(undone.messages[0]?.content).toBe("Message 0");
});

it("clears redo after a new save, preserves history on rename, and rejects unavailable actions", async () => {
  const queryId = await create();
  await expect(
    caller.changeQueryHistory(historyInput(queryId)),
  ).rejects.toThrow("no query change to undo");
  await caller.updateQuery({
    connectionId: "a",
    queryId,
    revision: "1-saved",
    query: { ...query, limit: 7 },
  });
  await caller.changeQueryHistory(historyInput(queryId));
  await caller.updateQueryNickname({
    connectionId: "a",
    queryId,
    revision: docs.get(queryId)!._rev,
    nickname: "Renamed",
  });
  expect(docs.get(queryId)!.queryHistory!.future).toHaveLength(1);
  await caller.updateQuery({
    connectionId: "a",
    queryId,
    revision: docs.get(queryId)!._rev,
    query: { ...query, limit: 3 },
  });
  expect(docs.get(queryId)!.queryHistory!.future).toEqual([]);
  await expect(
    caller.changeQueryHistory(historyInput(queryId, "redo")),
  ).rejects.toThrow("no query change to redo");
});
it("supports create, fetch, list, edit, rename and delete without changing ownership", async () => {
  const queryId = await create();
  const { query: saved } = await caller.fetchQuery({
    connectionId: "a",
    queryId,
  });
  expect(
    (await caller.listSavedQueries({ connectionId: "a" })).queries.map(
      (q) => q.id,
    ),
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
    projectId: "a",
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
it("rejects wrong-project fetch, edit, rename and delete before any write", async () => {
  const queryId = await create();
  mocks.active = "b";
  mocks.project = "b";
  mocks.put.mockClear();
  const input = { connectionId: "b", queryId, revision: "1-saved" };
  for (const operation of [
    () => caller.fetchQuery(input),
    () => caller.updateQuery({ ...input, query }),
    () => caller.updateQueryNickname({ ...input, nickname: "Stolen" }),
    () => caller.deleteQuery(input),
    () => caller.changeQueryHistory({ ...historyInput(queryId), ...input }),
  ])
    await expect(operation()).rejects.toThrow("different project");
  expect(
    (await caller.listSavedQueries({ connectionId: "b" })).queries,
  ).toEqual([]);
  expect(mocks.put).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(docs.get(queryId)?.projectId).toBe("a");
});
it("rejects stale revisions for edits, renames and deletes", async () => {
  const queryId = await create();
  const input = { connectionId: "a", queryId, revision: "stale" };
  for (const operation of [
    () => caller.updateQuery({ ...input, query }),
    () => caller.updateQueryNickname({ ...input, nickname: "Old" }),
    () => caller.deleteQuery(input),
    () =>
      caller.changeQueryHistory({
        ...historyInput(queryId),
        ...input,
        queryHistory: appendQueryVersion(createQueryHistory(query), {
          ...query,
          limit: 7,
        }),
      }),
  ])
    await expect(operation()).rejects.toMatchObject({ code: "CONFLICT" });
  expect(docs.get(queryId)?._rev).toBe("1-saved");
});
it("rejects stale renderer context for create and fetch", async () => {
  const queryId = await create();
  mocks.active = "b";
  mocks.get.mockClear();
  await expect(
    caller.createQuery({ connectionId: "a", query }),
  ).rejects.toThrow("active connection changed");
  await expect(
    caller.fetchQuery({ connectionId: "a", queryId }),
  ).rejects.toThrow("active connection changed");
  expect(mocks.get).not.toHaveBeenCalled();
  expect(docs.size).toBe(1);
});
it.each(["fetch", "update", "rename", "delete", "list", "history"] as const)(
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
      history: () =>
        caller.changeQueryHistory({ ...historyInput(queryId), ...input }),
    };
    await expect(operations[operation]()).rejects.toThrow(
      "active connection changed",
    );
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  },
);

it.each(["update", "rename", "delete", "history"] as const)(
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
      history: () =>
        caller.changeQueryHistory({
          ...historyInput(queryId),
          ...input,
          queryHistory: appendQueryVersion(createQueryHistory(query), {
            ...query,
            limit: 7,
          }),
        }),
    };
    await expect(operations[operation]()).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(docs.get(queryId)).toMatchObject({
      _rev: "2-concurrent",
      nickname: "Concurrent edit",
    });
  },
);

it("shares saved queries between environments in the same project", async () => {
  const queryId = await create();
  mocks.active = "staging";
  ++mocks.generation;
  expect(
    (await caller.listSavedQueries({ connectionId: "staging" })).queries.map(
      ({ id }) => id,
    ),
  ).toEqual([queryId]);
  const saved = await caller.fetchQuery({ connectionId: "staging", queryId });
  expect(saved.query.projectId).toBe("a");
  expect(saved.query).not.toHaveProperty("connectionId");
  await caller.updateQueryNickname({
    connectionId: "staging",
    queryId,
    revision: saved.query._rev,
    nickname: "Shared query",
  });
  mocks.active = "a";
  ++mocks.generation;
  expect(
    (await caller.fetchQuery({ connectionId: "a", queryId })).query.nickname,
  ).toBe("Shared query");
});

it("rejects a project switch away and back while reading a query", async () => {
  const queryId = await create();
  const get = mocks.get.getMockImplementation()!;
  mocks.get.mockImplementation(async (id) => {
    const doc = await get(id);
    mocks.projectGeneration += 2;
    return doc;
  });
  await expect(
    caller.updateQueryNickname({
      connectionId: "a",
      queryId,
      revision: "1-saved",
      nickname: "Stale",
    }),
  ).rejects.toThrow("active project changed");
  expect(docs.get(queryId)!.nickname).not.toBe("Stale");
});

it("saves SQL definitions and makes conversion irreversible without retaining the relationship tree", async () => {
  const queryId = await create();
  const converted = await caller.updateQuery({
    connectionId: "a",
    queryId,
    revision: "1-saved",
    query: {
      mode: "sql",
      sql: "SELECT * FROM orders WHERE status = $1",
      parameters: ["paid"],
      dialect: "postgres",
    },
  });
  const saved = docs.get(queryId)!;
  expect(saved).toMatchObject({
    mode: "sql",
    sql: "SELECT * FROM orders WHERE status = $1",
    parameters: ["paid"],
  });
  expect(saved).not.toHaveProperty("base");
  expect(saved).not.toHaveProperty("queryHistory");
  await expect(
    caller.updateQuery({
      connectionId: "a",
      queryId,
      revision: converted.revision,
      query,
    }),
  ).rejects.toThrow("cannot be converted back");
  const created = await caller.createQuery({
    connectionId: "a",
    query: { mode: "sql", sql: "SELECT 42" },
  });
  expect(docs.get(created.queryId)).toMatchObject({
    mode: "sql",
    sql: "SELECT 42",
  });
  await caller.deleteQuery({
    connectionId: "a",
    queryId,
    revision: converted.revision,
  });
  expect(docs.has(queryId)).toBe(false);
});

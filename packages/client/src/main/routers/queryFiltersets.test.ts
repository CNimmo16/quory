import { beforeEach, expect, it, vi } from "vitest";
import { ConditionOperator, type Query } from "@quory/core";
import type { SavedFilterset } from "../../shared/queryFiltersets";
const mocks = vi.hoisted(() => ({
  assertConnection: vi.fn(),
  assertCurrent: vi.fn(),
  fetch: vi.fn(),
  put: vi.fn(),
  allDocs: vi.fn(),
}));
vi.mock("../repositories/savedQueryService", () => ({
  savedQueryService: mocks,
}));
vi.mock("../repositories/queryFiltersetRepo", () => ({
  queryFiltersetRepo: () => mocks,
}));
import { router } from "../util/trpc";
import { queryFiltersetProcedures } from "./queryFiltersets";
const caller = router(queryFiltersetProcedures).createCaller({});
const scope = {
  connectionId: "connection",
  projectId: "project",
  queryId: "query",
};
const query: Query = {
  base: {
    tableRef: "public.orders",
    select: ["id"],
    where: {
      column: "status",
      operator: ConditionOperator.EQUALS,
      value: "open",
    },
  },
};
let docs: Map<string, SavedFilterset & { _id: string }>;
beforeEach(() => {
  vi.resetAllMocks();
  docs = new Map();
  mocks.assertConnection.mockResolvedValue({
    connectionId: "connection",
    projectId: "project",
    generation: 1,
    projectGeneration: 1,
  });
  mocks.fetch.mockResolvedValue({ ...query, projectId: "project" });
  mocks.put.mockImplementation(async (doc) => {
    if (docs.has(doc._id)) throw { status: 409 };
    docs.set(doc._id, structuredClone(doc));
    return { id: doc._id };
  });
  mocks.allDocs.mockImplementation(async () => ({
    rows: [...docs.values()].map((doc) => ({ doc })),
  }));
});
it("saves filter-only snapshots in the local repository without changing the query definition or its revision", async () => {
  const { id } = await caller.saveFilterset({
    ...scope,
    name: " Open orders ",
    query,
  });
  const doc = docs.get(id)!;
  expect(doc.name).toBe("Open orders");
  expect(doc.projectId).toBe("project");
  expect(doc.queryId).toBe("query");
  expect(doc.snapshot.filters[0]!.where).toEqual(query.base.where);
  expect(doc).not.toHaveProperty("query");
  expect(mocks.fetch).toHaveBeenCalledWith(
    expect.objectContaining({ projectId: "project" }),
    "query",
  );
  expect((await caller.listFiltersets(scope)).filtersets).toEqual([
    expect.objectContaining({ id, name: "Open orders" }),
  ]);
});
it("keeps filtersets isolated by both project and query", async () => {
  const { id } = await caller.saveFilterset({ ...scope, name: "Open", query });
  const doc = docs.get(id)!;
  docs.set("other-project", {
    ...doc,
    _id: "other-project",
    projectId: "other",
  });
  docs.set("other-query", { ...doc, _id: "other-query", queryId: "other" });
  expect(
    (await caller.listFiltersets(scope)).filtersets.map((item) => item.id),
  ).toEqual([id]);
  await expect(
    caller.listFiltersets({ ...scope, projectId: "other" }),
  ).rejects.toThrow("active project changed");
});
it("rejects blank and duplicate names without overwriting an existing snapshot", async () => {
  await expect(
    caller.saveFilterset({ ...scope, name: "   ", query }),
  ).rejects.toThrow();
  await caller.saveFilterset({ ...scope, name: "Open", query });
  await expect(
    caller.saveFilterset({ ...scope, name: "open", query }),
  ).rejects.toThrow("already exists");
  expect(docs.size).toBe(1);
});
it("rechecks the active context after asynchronous reads before returning filtersets", async () => {
  mocks.allDocs.mockImplementation(async () => {
    mocks.assertConnection.mockRejectedValue(
      new Error("The active connection changed"),
    );
    return { rows: [] };
  });
  await expect(caller.listFiltersets(scope)).rejects.toThrow(
    "active connection changed",
  );
});
it("does not save filtersets for SQL queries or when access to the query is denied", async () => {
  mocks.fetch.mockResolvedValue({ mode: "sql", sql: "SELECT 1" });
  await expect(
    caller.saveFilterset({ ...scope, name: "Open", query }),
  ).rejects.toThrow("relationship queries only");
  mocks.fetch.mockRejectedValue(
    new Error("This query belongs to a different project"),
  );
  await expect(
    caller.saveFilterset({ ...scope, name: "Open", query }),
  ).rejects.toThrow("different project");
  expect(mocks.put).not.toHaveBeenCalled();
});

it("does not dispatch a write when the connection changes immediately before persistence", async () => {
  mocks.assertCurrent.mockImplementation(() => {
    throw new Error("The active connection changed");
  });
  await expect(
    caller.saveFilterset({ ...scope, name: "Open", query }),
  ).rejects.toThrow("active connection changed");
  expect(mocks.put).not.toHaveBeenCalled();
});

it("lists the most recently saved filtersets first", async () => {
  const { id } = await caller.saveFilterset({
    ...scope,
    name: "A older filterset",
    query,
  });
  const first = docs.get(id)!;
  first.createdAt = "2026-01-01T00:00:00.000Z";
  docs.set("newer", {
    ...first,
    _id: "newer",
    name: "Z newest filterset",
    createdAt: "2026-02-01T00:00:00.000Z",
  });
  expect(
    (await caller.listFiltersets(scope)).filtersets.map((item) => item.id),
  ).toEqual(["newer", id]);
});

import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  allDocs: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("./queryRepo", () => ({ queryRepo: mocks }));
vi.mock("./folderQueryRepo", () => ({
  FolderQueryRepo: class {
    get = mocks.get;
    put = mocks.put;
    allDocs = mocks.allDocs;
    remove = mocks.remove;
  },
}));
import {
  projectQueryRepo,
  discardEphemeralQuery,
  discardProjectEphemeralQueries,
} from "./projectQueryRepo";
const project = {
  _id: "project",
  _rev: "1",
  name: "Test",
  storage: "database" as const,
};
const definition = {
  base: { tableRef: "public.orders", select: "*" as const },
  nickname: "",
  ephemeral: true,
  _id: "draft",
  projectId: "project",
};
beforeEach(() => {
  discardProjectEphemeralQueries("project");
  vi.resetAllMocks();
  mocks.allDocs.mockResolvedValue({ rows: [] });
  mocks.get.mockRejectedValue(
    Object.assign(new Error("Missing"), { status: 404 }),
  );
  mocks.put.mockResolvedValue({ rev: "1-saved" });
});

it.each(["database", "folder"] as const)(
  "keeps %s project drafts in memory until a named save",
  async (storage) => {
    const repo = projectQueryRepo({
      ...project,
      storage,
      directory: "/project/.quory",
    });
    const created = await repo.put(definition);
    const draft = await repo.get("draft");
    expect(draft._rev).toBe(created.rev);
    expect(
      (await repo.allDocs({ include_docs: true })).rows.map(({ id }) => id),
    ).toEqual(["draft"]);
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
    const result = await repo.put({
      ...draft,
      ephemeral: false,
      nickname: "Orders",
    });
    expect(result.rev).toBe("1-saved");
    expect(mocks.put).toHaveBeenCalledWith({
      ...definition,
      ephemeral: undefined,
      nickname: "Orders",
      modifiedAt: expect.any(Number),
    });
    expect((await repo.allDocs({ include_docs: true })).rows).toEqual([]);
  },
);

it("preserves a draft after a failed save and rejects stale updates", async () => {
  const repo = projectQueryRepo(project);
  await repo.put(definition);
  const draft = await repo.get("draft");
  mocks.put.mockRejectedValueOnce(new Error("Disk unavailable"));
  await expect(
    repo.put({ ...draft, ephemeral: false, nickname: "Orders" }),
  ).rejects.toThrow("Disk unavailable");
  expect(await repo.get("draft")).toEqual(draft);
  if (draft.mode === "sql") throw new Error("Expected a relationship query");
  await repo.put({ ...draft, limit: 7 });
  await expect(repo.put(draft)).rejects.toMatchObject({ status: 409 });
});

it("scopes drafts and discard operations to their project and prevents resurrection", async () => {
  const repo = projectQueryRepo(project);
  await repo.put(definition);
  const draft = await repo.get("draft");
  const other = projectQueryRepo({ ...project, _id: "other" });
  expect((await other.allDocs({ include_docs: true })).rows).toEqual([]);
  discardEphemeralQuery("other", "draft");
  expect(await repo.get("draft")).toEqual(draft);
  discardEphemeralQuery("project", "draft");
  await expect(repo.put(draft)).rejects.toMatchObject({ status: 409 });
  expect(mocks.put).not.toHaveBeenCalled();
});

it("changes persisted modification time on edits and renames, never on reads", async () => {
  let stored = {
    ...definition,
    ephemeral: false,
    nickname: "Orders",
    modifiedAt: 100,
    _rev: "1-saved",
  };
  mocks.get.mockImplementation(async () => structuredClone(stored));
  mocks.allDocs.mockImplementation(async () => ({
    rows: [{ id: stored._id, doc: structuredClone(stored) }],
  }));
  mocks.put.mockImplementation(async (doc) => {
    stored = { ...doc, _rev: "2-saved" };
    return { rev: stored._rev };
  });
  const repo = projectQueryRepo(project);
  expect((await repo.get("draft")).modifiedAt).toBe(100);
  await repo.allDocs({ include_docs: true });
  expect(mocks.put).not.toHaveBeenCalled();
  const current = await repo.get("draft");
  if (current.mode === "sql") throw new Error("Expected a relationship query");
  await repo.put({ ...current, limit: 7 });
  const editedAt = stored.modifiedAt;
  expect(editedAt).toBeGreaterThan(100);
  await repo.get("draft");
  await repo.allDocs({ include_docs: true });
  expect(stored.modifiedAt).toBe(editedAt);
  await repo.put({ ...(await repo.get("draft")), nickname: "Renamed" });
  expect(stored.modifiedAt).toBeGreaterThan(editedAt);
  const renamedAt = stored.modifiedAt;
  mocks.put.mockRejectedValueOnce(new Error("Write failed"));
  await expect(
    repo.put({ ...(await repo.get("draft")), nickname: "Failed rename" }),
  ).rejects.toThrow("Write failed");
  expect(stored.modifiedAt).toBe(renamedAt);
});

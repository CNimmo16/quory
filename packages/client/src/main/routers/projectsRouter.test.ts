import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  folders: vi.fn(),
  folderQueries: vi.fn(),
  folderGet: vi.fn(),
  folderPut: vi.fn(),
  folderRemove: vi.fn(),
  dialog: vi.fn(),
  disconnect: vi.fn(),
  repos: new Map<string, Map<string, Record<string, unknown>>>(),
  deleted: new Set<string>(),
}));
vi.mock("electron", () => ({ dialog: { showOpenDialog: mocks.dialog } }));
vi.mock("../state/activeConnectionState", () => ({
  default: { deleteActiveConnection: mocks.disconnect },
}));
vi.mock("../repositories/folderQueryRepo", () => ({
  initializeProjectFolder: mocks.folders,
  FolderQueryRepo: class {
    allDocs = mocks.folderQueries;
    get = mocks.folderGet;
    put = mocks.folderPut;
    remove = mocks.folderRemove;
  },
}));
vi.mock("../util/makeRepo", () => ({
  default: (namespace: string) => {
    const docs = new Map<string, Record<string, unknown>>();
    mocks.repos.set(namespace, docs);
    return {
      get: async (id: string) => {
        const doc = docs.get(id);
        if (!doc) throw { status: 404 };
        return structuredClone(doc);
      },
      allDocs: async () => ({
        rows: [...docs].map(([id, doc]) => ({ id, doc: structuredClone(doc) })),
      }),
      remove: async (doc: { _id: string }) => {
        docs.delete(doc._id);
        mocks.deleted.add(`${namespace}:${doc._id}`);
      },
      put: async (doc: Record<string, unknown> & { _id: string }) => {
        if (mocks.deleted.has(`${namespace}:${doc._id}`)) throw { status: 409 };
        docs.set(doc._id, { ...doc, _rev: "1-saved" });
        return { rev: "1-saved" };
      },
    };
  },
}));
import projectsRouter from "./projectsRouter";
import { activeProjectState } from "../state/activeProjectState";
const caller = projectsRouter.createCaller({});
beforeEach(async () => {
  vi.clearAllMocks();
  for (const docs of mocks.repos.values()) docs.clear();
  mocks.deleted.clear();
  await activeProjectState.close();
  mocks.disconnect.mockClear();
  mocks.folderQueries.mockResolvedValue({ rows: [] });
});

// Run migration first: its completion is cached for the lifetime of the app.
it("migrates legacy connections and queries into a project without losing IDs or chat", async () => {
  mocks.repos.get("connections")!.set("local", {
    _id: "local",
    _rev: "old",
    nickname: "Local",
    password: "secret",
  });
  mocks.repos.get("queries")!.set("query-1", {
    _id: "query-1",
    _rev: "old",
    connectionId: "local",
    nickname: "Orders",
    base: { tableRef: "public.orders", select: "*" },
    chatMessages: [{ id: "chat", content: "Earlier conversation" }],
  });
  const data = await caller.list();
  expect(data.activeProject).toBeNull();
  expect(data.projects.map(({ id }) => id)).toEqual(["imported-project"]);
  expect(mocks.repos.get("connections")!.get("local")).toMatchObject({
    projectId: "imported-project",
    password: "secret",
  });
  expect(mocks.repos.get("queries")!.get("query-1")).toMatchObject({
    projectId: "imported-project",
    chatMessages: [{ id: "chat" }],
  });
  expect(mocks.repos.get("queries")!.get("query-1")).not.toHaveProperty(
    "connectionId",
  );
});

it("starts at selection and creates a database project without a filesystem path", async () => {
  expect(await caller.list()).toEqual({ projects: [], activeProject: null });
  const { projectId } = await caller.create({
    name: "My app",
    storage: "database",
  });
  const { project } = await caller.open({ projectId });
  expect(project).toMatchObject({
    _id: projectId,
    name: "My app",
    storage: "database",
  });
  expect(project).not.toHaveProperty("directory");
  expect(mocks.disconnect).toHaveBeenCalledOnce();
  expect((await caller.list()).activeProject?._id).toBe(projectId);
});

it("renames an active project without disconnecting and rejects stale revisions", async () => {
  const { projectId } = await caller.create({
    name: "Original",
    storage: "database",
  });
  await caller.open({ projectId });
  mocks.disconnect.mockClear();
  await caller.rename({ projectId, revision: "1-saved", name: "Renamed" });
  expect(activeProjectState.getActiveProject()?.name).toBe("Renamed");
  expect((await caller.list()).projects[0]?.project.name).toBe("Renamed");
  expect(mocks.disconnect).not.toHaveBeenCalled();
  await expect(
    caller.rename({ projectId, revision: "stale", name: "Wrong" }),
  ).rejects.toThrow("item changed");
});

it("manages project queries without selecting a project or connection, rejecting cross-project and stale requests", async () => {
  const { projectId } = await caller.create({
    name: "App",
    storage: "database",
  });
  const { projectId: other } = await caller.create({
    name: "Other",
    storage: "database",
  });
  mocks.repos.get("queries")!.set("orders", {
    _id: "orders",
    _rev: "1-query",
    projectId,
    nickname: "Orders",
    base: { tableRef: "public.orders", select: "*" },
    chatMessages: [{ content: "Keep this" }],
  });
  await expect(
    caller.renameQuery({
      projectId: other,
      queryId: "orders",
      revision: "1-query",
      nickname: "Wrong",
    }),
  ).rejects.toThrow("different project");
  await expect(
    caller.deleteQuery({ projectId, queryId: "orders", revision: "stale" }),
  ).rejects.toThrow("item changed");
  await caller.renameQuery({
    projectId,
    queryId: "orders",
    revision: "1-query",
    nickname: "Renamed",
  });
  expect(mocks.repos.get("queries")!.get("orders")).toMatchObject({
    nickname: "Renamed",
    chatMessages: [{ content: "Keep this" }],
  });
  expect(activeProjectState.getActiveProject()).toBeNull();
  await caller.deleteQuery({
    projectId,
    queryId: "orders",
    revision: "1-saved",
  });
  expect(mocks.repos.get("queries")!.has("orders")).toBe(false);
  expect(mocks.disconnect).not.toHaveBeenCalled();
});

it("deletes an active project and its app data while preserving another project's data", async () => {
  const { projectId } = await caller.create({
    name: "App",
    storage: "database",
  });
  const { projectId: other } = await caller.create({
    name: "Other",
    storage: "database",
  });
  for (const namespace of ["queries", "connections"]) {
    mocks.repos
      .get(namespace)!
      .set("owned", { _id: "owned", _rev: "1-owned", projectId });
    mocks.repos
      .get(namespace)!
      .set("other", { _id: "other", _rev: "1-other", projectId: other });
  }
  await caller.open({ projectId });
  await caller.delete({ projectId, revision: "1-saved" });
  expect(activeProjectState.getActiveProject()).toBeNull();
  expect((await caller.list()).projects.map(({ id }) => id)).toEqual([other]);
  for (const namespace of ["queries", "connections"])
    expect([...mocks.repos.get(namespace)!.keys()]).toEqual(["other"]);
});

it("unregisters folder projects without deleting their shared files", async () => {
  mocks.folders.mockResolvedValue({
    directory: "/repo/.quory",
    manifest: { id: "folder" },
  });
  const { projectId } = await caller.create({
    name: "Folder",
    storage: "folder",
    folderPath: "/repo",
  });
  mocks.folderQueries.mockClear();
  await caller.delete({ projectId, revision: "1-saved" });
  expect((await caller.list()).projects).toEqual([]);
  expect(mocks.folderQueries).not.toHaveBeenCalled();
  expect(mocks.folderRemove).not.toHaveBeenCalled();
  const restored = await caller.create({
    name: "Restored folder",
    storage: "folder",
    folderPath: "/repo",
  });
  expect(restored.projectId).not.toBe(projectId);
  expect((await caller.list()).projects[0]?.project.directory).toBe(
    "/repo/.quory",
  );
});

it("uses the folder repository when renaming or deleting a folder query", async () => {
  mocks.folders.mockResolvedValue({
    directory: "/repo/.quory",
    manifest: { id: "folder" },
  });
  const { projectId } = await caller.create({
    name: "Folder",
    storage: "folder",
    folderPath: "/repo",
  });
  const query = {
    _id: "orders",
    _rev: "1-folder",
    projectId,
    nickname: "Orders",
  };
  mocks.folderGet.mockResolvedValue(query);
  mocks.folderPut.mockResolvedValue({ rev: "2-folder" });
  await caller.renameQuery({
    projectId,
    queryId: "orders",
    revision: "1-folder",
    nickname: "New name",
  });
  expect(mocks.folderPut).toHaveBeenCalledWith({
    ...query,
    nickname: "New name",
  });
  await caller.deleteQuery({
    projectId,
    queryId: "orders",
    revision: "1-folder",
  });
  expect(mocks.folderRemove).toHaveBeenCalledWith(query);
});

it("lists queries from an unselected project without changing projects or connections", async () => {
  const { projectId: first } = await caller.create({
    name: "First",
    storage: "database",
  });
  const { projectId: second } = await caller.create({
    name: "Second",
    storage: "database",
  });
  mocks.repos.get("queries")!.set("first-query", {
    _id: "first-query",
    projectId: first,
    nickname: "First query",
  });
  mocks.repos.get("queries")!.set("second-query", {
    _id: "second-query",
    projectId: second,
    nickname: "Second query",
  });
  expect(
    (await caller.listQueries({ projectId: second })).queries.map(
      ({ id }) => id,
    ),
  ).toEqual(["second-query"]);
  expect(activeProjectState.getActiveProject()).toBeNull();
  await caller.open({ projectId: first });
  mocks.disconnect.mockClear();
  expect(
    (await caller.listQueries({ projectId: second })).queries.map(
      ({ id }) => id,
    ),
  ).toEqual(["second-query"]);
  expect(activeProjectState.getActiveProject()?._id).toBe(first);
  expect(mocks.disconnect).not.toHaveBeenCalled();
});

it("reads an unselected folder project's saved queries without opening it", async () => {
  mocks.folders.mockResolvedValue({
    directory: "/repo/.quory",
    manifest: { id: "folder" },
  });
  const { projectId } = await caller.create({
    name: "Folder",
    storage: "folder",
    folderPath: "/repo",
  });
  mocks.folderQueries.mockResolvedValue({
    rows: [{ id: "sql", doc: { projectId, nickname: "SQL", mode: "sql" } }],
  });
  expect((await caller.listQueries({ projectId })).queries).toEqual([
    { id: "sql", query: { projectId, nickname: "SQL", mode: "sql" } },
  ]);
  expect(activeProjectState.getActiveProject()).toBeNull();
  expect(mocks.disconnect).not.toHaveBeenCalled();
});

it("reuses a registered folder and keeps a cloned repository as a separate local project", async () => {
  const id = "ed53886b-4d38-4da9-961f-bd2f16dcefd8";
  mocks.folders.mockResolvedValue({
    directory: "/repo/.quory",
    manifest: { id },
  });
  const first = await caller.create({
    name: "Repo",
    storage: "folder",
    folderPath: "/repo",
  });
  const reopened = await caller.create({
    name: "Repo",
    storage: "folder",
    folderPath: "/repo/.quory",
  });
  expect(reopened).toEqual(first);
  mocks.folders.mockResolvedValue({
    directory: "/other-clone/.quory",
    manifest: { id },
  });
  const cloned = await caller.create({
    name: "Clone",
    storage: "folder",
    folderPath: "/other-clone",
  });
  expect(cloned.projectId).not.toBe(first.projectId);
  expect((await caller.list()).projects).toHaveLength(2);
});

it("shows hidden folders in the native folder picker and handles cancellation", async () => {
  mocks.dialog.mockResolvedValue({
    canceled: false,
    filePaths: ["/repo/.quory"],
  });
  expect(await caller.chooseFolder()).toEqual({ path: "/repo/.quory" });
  expect(mocks.dialog).toHaveBeenCalledWith(
    expect.objectContaining({
      properties: ["openDirectory", "showHiddenFiles"],
    }),
  );
  mocks.dialog.mockResolvedValue({ canceled: true, filePaths: [] });
  expect(await caller.chooseFolder()).toEqual({ path: null });
});

it("prevents a superseded project selection from publishing stale state", async () => {
  const first = await caller.create({ name: "First", storage: "database" });
  const second = await caller.create({ name: "Second", storage: "database" });
  let finish!: () => void;
  mocks.disconnect.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const pending = caller.open(first);
  await vi.waitFor(() => expect(mocks.disconnect).toHaveBeenCalledOnce());
  await caller.open(second);
  finish();
  await expect(pending).rejects.toThrow("superseded");
  expect((await caller.list()).activeProject?._id).toBe(second.projectId);
});

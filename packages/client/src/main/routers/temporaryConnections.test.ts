import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  allDocs: vi.fn(),
  remove: vi.fn(),
  create: vi.fn(),
}));
vi.mock("../util/makeRepo", () => ({ default: () => mocks }));
vi.mock("../repositories/projectRepo", () => ({
  projectRepo: {
    get: async (id: string) => ({
      _id: id,
      _rev: "1-project",
      name: id,
      storage: "database",
    }),
  },
}));
vi.mock("../repositories/folderQueryRepo", () => ({
  FolderQueryRepo: vi.fn(),
}));
vi.mock("@quory/stack/server", () => ({
  makeQuoryRequestHandler: mocks.create,
  DatabaseConnectionFailedError: class extends Error {},
}));
import connectionsRouter from "./connectionsRouter";
import { connectionRepo } from "../state/connectionRepo";
import { activeProjectState } from "../state/activeProjectState";
import { quorySessions } from "../state/quorySession";

const caller = connectionsRouter.createCaller({});
const config = {
  type: "postgres" as const,
  nickname: "Temporary DB",
  hostOrFilePath: "localhost",
  password: "secret",
  temporary: true,
};
const request = () =>
  Object.assign(vi.fn().mockResolvedValue({ schemas: [] }), {
    dispose: vi.fn().mockResolvedValue(undefined),
  });
async function create(nickname = config.nickname) {
  return (await caller.saveConnection({ config: { ...config, nickname } }))
    .connectionId;
}
async function ids(projectId?: string) {
  return (
    await caller.listSavedConnections(projectId ? { projectId } : undefined)
  ).connections.map(({ id }) => id);
}

beforeEach(async () => {
  await activeProjectState.close();
  mocks.allDocs.mockResolvedValue({ rows: [] });
  for (const { id } of (await connectionRepo.allDocs({ include_docs: true }))
    .rows)
    connectionRepo.forgetTemporary(id);
  vi.clearAllMocks();
  mocks.get.mockRejectedValue(new Error("missing"));
  mocks.create.mockImplementation(async () => request());
  await activeProjectState.open("project-a");
});

it("keeps temporary credentials in memory and removes them on disconnect", async () => {
  const id = await create();
  expect(mocks.put).not.toHaveBeenCalled();
  expect(await ids()).toEqual([id]);
  expect(
    (await caller.fetchConnectionById({ connectionId: id })).connection,
  ).toMatchObject({
    projectId: "project-a",
    temporary: true,
    password: "secret",
  });
  await caller.connectToDatabase({ connectionId: id });
  expect((await caller.fetchActiveConnection()).connection?._id).toBe(id);
  await caller.disconnectFromDatabase();
  expect(await ids()).toEqual([]);
  await expect(
    caller.fetchConnectionById({ connectionId: id }),
  ).rejects.toThrow("missing");
  expect(mocks.put).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
});

it("forgets a temporary connection only after its replacement succeeds", async () => {
  const a = await create("First"),
    b = await create("Second");
  await caller.connectToDatabase({ connectionId: a });
  mocks.create.mockRejectedValueOnce(new Error("offline"));
  await expect(caller.connectToDatabase({ connectionId: b })).rejects.toThrow(
    "offline",
  );
  expect(await ids()).toEqual([a, b]);
  expect(quorySessions.connectionId).toBe(a);
  await caller.connectToDatabase({ connectionId: b });
  expect(await ids()).toEqual([b]);
  expect(quorySessions.connectionId).toBe(b);
});

it("preserves the connection when reopening its project, and removes it when changing project", async () => {
  const id = await create();
  await caller.connectToDatabase({ connectionId: id });
  const generation = quorySessions.connectionGeneration;
  await activeProjectState.open("project-a");
  expect(quorySessions.connectionId).toBe(id);
  expect(quorySessions.connectionGeneration).toBe(generation);
  await activeProjectState.open("project-b");
  expect(await ids("project-a")).toEqual([]);
  expect(await ids()).toEqual([]);
});

it("scopes temporary templates and nickname conflicts to their project", async () => {
  const id = await create();
  await activeProjectState.open("project-b");
  expect(await ids()).toEqual([]);
  await expect(
    caller.fetchConnectionById({ connectionId: id }),
  ).rejects.toThrow("different project");
  await expect(caller.connectToDatabase({ connectionId: id })).rejects.toThrow(
    "different project",
  );
  await expect(caller.deleteConnection({ connectionId: id })).rejects.toThrow(
    "different project",
  );
  const other = await create();
  expect(await ids()).toEqual([other]);
  expect(await ids("project-a")).toEqual([id]);
  await expect(create()).rejects.toThrow("already exists");
  expect(mocks.put).not.toHaveBeenCalled();
});

it("allows editing and reconnecting a temporary connection without persisting it", async () => {
  const id = await create();
  const { connection } = await caller.fetchConnectionById({ connectionId: id });
  await caller.connectToDatabase({ connectionId: id });
  await caller.saveConnection({
    connectionId: id,
    revision: connection._rev,
    config: { ...config, nickname: "Updated" },
  });
  expect(quorySessions.connectionId).toBeUndefined();
  const updated = (await caller.fetchConnectionById({ connectionId: id }))
    .connection;
  expect(updated.nickname).toBe("Updated");
  expect(updated._rev).not.toBe(connection._rev);
  await expect(
    caller.saveConnection({
      connectionId: id,
      revision: connection._rev,
      config,
    }),
  ).rejects.toThrow("Connection changed");
  await caller.connectToDatabase({ connectionId: id });
  await caller.disconnectFromDatabase();
  expect(await ids()).toEqual([]);
  expect(mocks.put).not.toHaveBeenCalled();
});

it("never persists an existing temporary connection through an edit", async () => {
  const id = await create();
  await expect(
    caller.saveConnection({
      connectionId: id,
      config: { ...config, temporary: false },
    }),
  ).rejects.toThrow("Duplicate");
  expect(mocks.put).not.toHaveBeenCalled();
});

it("retains saved connections after disconnect", async () => {
  const saved = {
    ...config,
    temporary: false,
    _id: "saved",
    _rev: "1-saved",
    projectId: "project-a",
  };
  mocks.get.mockResolvedValue(saved);
  mocks.allDocs.mockResolvedValue({ rows: [{ id: saved._id, doc: saved }] });
  await caller.connectToDatabase({ connectionId: saved._id });
  await caller.disconnectFromDatabase();
  expect(await ids()).toEqual([saved._id]);
  expect(mocks.remove).not.toHaveBeenCalled();
});

it("removes a temporary connection disconnected while initialization is still pending", async () => {
  const id = await create();
  let finish!: (handler: ReturnType<typeof request>) => void;
  mocks.create.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const connecting = caller.connectToDatabase({ connectionId: id });
  const rejection = expect(connecting).rejects.toThrow("superseded");
  await vi.waitFor(() => expect(finish).toBeDefined());
  const closing = activeProjectState.close();
  expect(await ids("project-a")).toEqual([]);
  const handler = request();
  finish(handler);
  await rejection;
  await closing;
  expect(handler.dispose).toHaveBeenCalledOnce();
  expect(quorySessions.connectionId).toBeUndefined();
});

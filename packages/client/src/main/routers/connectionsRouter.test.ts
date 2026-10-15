import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  allDocs: vi.fn(),
  requestHandler: vi.fn(),
  activate: vi.fn(),
  recreateMainWindow: vi.fn(),
  dispose: vi.fn(),
  deactivate: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("../util/makeRepo", () => ({
  default: () => ({
    get: mocks.get,
    put: mocks.put,
    allDocs: mocks.allDocs,
    remove: mocks.remove,
  }),
}));
vi.mock("@quory/stack/server", () => ({
  makeQuoryRequestHandler: mocks.requestHandler,
  DatabaseConnectionFailedError: class extends Error {},
}));
vi.mock("..", () => ({ recreateMainWindow: mocks.recreateMainWindow }));
vi.mock("../state/activeConnectionState", () => ({
  default: {
    setActiveConnection: mocks.activate,
    deleteActiveConnection: mocks.deactivate,
    getActiveConnectionId: async () => null,
    getActiveConnection: async () => null,
  },
}));
vi.mock("../state/quorySession", () => ({ refreshQuorySchema: vi.fn() }));
vi.mock("../state/activeProjectState", () => ({
  activeProjectState: {
    requireActiveProject: () => ({ _id: "project-1", storage: "database" }),
    getActiveProject: () => ({ _id: "project-1", storage: "database" }),
    getProjectGeneration: () => 0,
    assertCurrent: () => {},
  },
}));
import connectionsRouter from "./connectionsRouter";
import { DatabaseConnectionFailedError } from "@quory/stack/server";

const caller = connectionsRouter.createCaller({});
const config = {
  type: "postgres" as const,
  nickname: "Cloud DB",
  hostOrFilePath: "db.example.com",
  port: 5432,
  username: "app",
  password: "secret",
  database: "app",
  writeProtection: "read-only" as const,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requestHandler.mockResolvedValue({ dispose: mocks.dispose });
  mocks.allDocs.mockResolvedValue({ rows: [] });
  mocks.get.mockResolvedValue({ ...config, projectId: "project-1" });
});

it("saves and reloads a preset connection colour", async () => {
  const result = await caller.saveConnection({
    config: { ...config, colour: "red" },
  });
  const saved = mocks.put.mock.calls[0]![0];
  expect(saved.colour).toBe("red");
  mocks.get.mockResolvedValue(saved);
  expect(
    (await caller.fetchConnectionById({ connectionId: result.connectionId }))
      .connection.colour
  ).toBe("red");
});

it("rejects colours outside the preset list", async () => {
  await expect(
    caller.saveConnection({ config: { ...config, colour: "invalid" as "red" } })
  ).rejects.toThrow();
  expect(mocks.put).not.toHaveBeenCalled();
});

describe("SSL connection persistence", () => {
  it("validates, saves, reloads and reconnects with all SSL options", async () => {
    const ssl = {
      mode: "verify-full" as const,
      ca: "CA PEM",
      cert: "CERT PEM",
      key: "KEY PEM",
    };
    const result = await caller.saveConnection({ config: { ...config, ssl } });
    expect(mocks.requestHandler).toHaveBeenCalledWith({
      database: { ...config, ssl },
    });
    const saved = mocks.put.mock.calls[0]![0];
    expect(saved).toEqual({
      ...config,
      projectId: "project-1",
      ssl,
      _id: result.connectionId,
      _rev: undefined,
    });
    mocks.get.mockResolvedValue(saved);
    expect(
      await caller.fetchConnectionById({ connectionId: result.connectionId })
    ).toEqual({ connection: saved });
    await caller.connectToDatabase({ connectionId: result.connectionId });
    expect(mocks.dispose).toHaveBeenCalledTimes(1);
    expect(mocks.activate).toHaveBeenCalledWith(result.connectionId);
  });

  it("supports connections without SSL and removes previously saved SSL on update", async () => {
    await caller.saveConnection({
      config,
      connectionId: "existing",
      revision: "1-old",
    });
    expect(mocks.put).toHaveBeenCalledWith({
      ...config,
      projectId: "project-1",
      _id: "existing",
      _rev: "1-old",
    });
    expect(mocks.requestHandler).toHaveBeenCalledWith({ database: config });
  });

  it.each([
    { mode: "verify-full", cert: "CERT PEM" },
    { mode: "verify-full", key: "KEY PEM" },
    { mode: "verify-full", cert: "CERT PEM", key: " \n " },
    { mode: "invalid" },
  ])("rejects invalid SSL options before connecting", async (ssl) => {
    // Exercise runtime validation of IPC input, including invalid mode values.
    await expect(
      caller.saveConnection({
        config: { ...config, ssl: ssl as { mode: "verify-full" } },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.requestHandler).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it.each([
    new DatabaseConnectionFailedError("Certificate verification failed"),
    new Error("Invalid PEM certificate"),
  ])(
    "does not save or activate a connection when SSL setup fails",
    async (error) => {
      const database = { ...config, ssl: { mode: "verify-full" as const } };
      mocks.requestHandler.mockRejectedValue(error);
      await expect(caller.saveConnection({ config: database })).rejects.toThrow(
        error.message
      );
      expect(mocks.put).not.toHaveBeenCalled();
      mocks.get.mockResolvedValue({ ...database, projectId: "project-1" });
      mocks.activate.mockRejectedValue(error);
      await expect(
        caller.connectToDatabase({ connectionId: "existing" })
      ).rejects.toThrow(error.message);
      expect(mocks.activate).toHaveBeenCalledWith("existing");
      expect(mocks.recreateMainWindow).not.toHaveBeenCalled();
    }
  );
});

it("disposes temporary validation before rejecting a duplicate nickname", async () => {
  mocks.allDocs.mockResolvedValue({
    rows: [{ id: "other", doc: { ...config, projectId: "project-1" } }],
  });
  await expect(caller.saveConnection({ config })).rejects.toThrow(
    "already exists"
  );
  expect(mocks.dispose).toHaveBeenCalledTimes(1);
  expect(mocks.put).not.toHaveBeenCalled();
});

it("disposes temporary validation even when persistence fails", async () => {
  mocks.put.mockRejectedValue(new Error("write failed"));
  await expect(caller.saveConnection({ config })).rejects.toThrow(
    "write failed"
  );
  expect(mocks.dispose).toHaveBeenCalledTimes(1);
});

it("disconnects only the deleted connection", async () => {
  mocks.get.mockResolvedValue({ ...config, projectId: "project-1", _id: "a" });
  await caller.deleteConnection({ connectionId: "a" });
  expect(mocks.remove).toHaveBeenCalledTimes(1);
  expect(mocks.deactivate).toHaveBeenCalledWith("a");
});

it("scopes connections and duplicate nicknames to the current project", async () => {
  mocks.allDocs.mockResolvedValue({
    rows: [
      { id: "local", doc: { ...config, projectId: "project-1" } },
      { id: "other", doc: { ...config, projectId: "project-2" } },
    ],
  });
  expect(
    (await caller.listSavedConnections()).connections.map(({ id }) => id)
  ).toEqual(["local"]);
  mocks.allDocs.mockResolvedValue({
    rows: [{ id: "other", doc: { ...config, projectId: "project-2" } }],
  });
  await caller.saveConnection({ config });
  expect(mocks.put).toHaveBeenCalledOnce();
});

it("rejects fetching, activating, changing or deleting another project's connection", async () => {
  mocks.get.mockResolvedValue({ ...config, projectId: "project-2" });
  for (const operation of [
    () => caller.fetchConnectionById({ connectionId: "other" }),
    () => caller.connectToDatabase({ connectionId: "other" }),
    () =>
      caller.saveConnection({
        connectionId: "other",
        revision: "1-old",
        config,
      }),
    () => caller.deleteConnection({ connectionId: "other" }),
  ])
    await expect(operation()).rejects.toThrow("different project");
  expect(mocks.requestHandler).not.toHaveBeenCalled();
  expect(mocks.activate).not.toHaveBeenCalled();
  expect(mocks.put).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  allDocs: vi.fn(),
  requestHandler: vi.fn(),
  activate: vi.fn(),
  recreateMainWindow: vi.fn(),
}));
vi.mock("../util/makeRepo", () => ({
  default: () => ({ get: mocks.get, put: mocks.put, allDocs: mocks.allDocs }),
}));
vi.mock("@quory/stack/server", () => ({
  makeQuoryRequestHandler: mocks.requestHandler,
  DatabaseConnectionFailedError: class extends Error {},
}));
vi.mock("..", () => ({ recreateMainWindow: mocks.recreateMainWindow }));
vi.mock("../state/activeConnectionState", () => ({
  default: { setActiveConnection: mocks.activate },
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
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.allDocs.mockResolvedValue({ rows: [] });
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
      ssl,
      _id: result.connectionId,
      _rev: undefined,
    });
    mocks.get.mockResolvedValue(saved);
    expect(
      await caller.fetchConnectionById({ connectionId: result.connectionId })
    ).toEqual({ connection: saved });
    await caller.connectToDatabase({ connectionId: result.connectionId });
    expect(mocks.requestHandler).toHaveBeenLastCalledWith({ database: saved });
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
      mocks.get.mockResolvedValue(database);
      await expect(
        caller.connectToDatabase({ connectionId: "existing" })
      ).rejects.toThrow(error.message);
      expect(mocks.activate).not.toHaveBeenCalled();
      expect(mocks.recreateMainWindow).not.toHaveBeenCalled();
    }
  );
});

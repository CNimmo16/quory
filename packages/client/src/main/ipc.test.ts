import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  assertConnection: vi.fn(),
  getSession: vi.fn(),
  request: vi.fn(),
}));
vi.mock("electron", () => ({
  ipcMain: { removeHandler: vi.fn(), handle: mocks.handle },
}));
vi.mock("trpc-electron/main", () => ({
  createIPCHandler: () => ({ attachWindow: vi.fn(), detachWindow: vi.fn() }),
}));
vi.mock("./routers", () => ({ default: {} }));
vi.mock("./repositories/savedQueryService", () => ({
  savedQueryService: { assertConnection: mocks.assertConnection },
}));
vi.mock("./state/quorySession", () => ({ getQuorySession: mocks.getSession }));
import { attachIpcHandlers } from "./ipc";
import type { BrowserWindow } from "electron";

const context = { connectionId: "a", generation: 1 };
const body = { connectionId: "a", path: "query", data: {} };
let invoke: (event: unknown, body: unknown) => Promise<unknown>;
beforeEach(async () => {
  vi.resetAllMocks();
  mocks.assertConnection.mockResolvedValue(context);
  mocks.getSession.mockResolvedValue({ request: mocks.request });
  mocks.request.mockResolvedValue({ rows: [] });
  await attachIpcHandlers({} as BrowserWindow);
  invoke = mocks.handle.mock.calls[0]![1];
});

it("rejects a request from an inactive connection before opening a session", async () => {
  mocks.assertConnection.mockRejectedValueOnce(new Error("Connection changed"));
  await expect(invoke(null, body)).rejects.toThrow("Connection changed");
  expect(mocks.getSession).not.toHaveBeenCalled();
  expect(mocks.request).not.toHaveBeenCalled();
});

it("rejects a connection switch while obtaining the session", async () => {
  mocks.assertConnection
    .mockResolvedValueOnce(context)
    .mockRejectedValueOnce(new Error("Connection changed"));
  await expect(invoke(null, body)).rejects.toThrow("Connection changed");
  expect(mocks.request).not.toHaveBeenCalled();
  expect(mocks.assertConnection).toHaveBeenLastCalledWith(context);
});

it("rejects stale results after a connection switch", async () => {
  mocks.assertConnection
    .mockResolvedValueOnce(context)
    .mockResolvedValueOnce(context)
    .mockRejectedValueOnce(new Error("Connection changed"));
  await expect(invoke(null, body)).rejects.toThrow("Connection changed");
  expect(mocks.request).toHaveBeenCalledWith(body);
});

it("returns results when the connection generation remains active", async () => {
  await expect(invoke(null, body)).resolves.toEqual({ rows: [] });
  expect(mocks.assertConnection.mock.calls).toEqual([
    ["a"],
    [context],
    [context],
  ]);
});

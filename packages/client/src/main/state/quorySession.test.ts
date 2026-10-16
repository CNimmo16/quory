import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn(), create: vi.fn() }));
vi.mock("./connectionRepo", () => ({ connectionRepo: { get: mocks.get } }));
vi.mock("@quory/stack/server", () => ({
  makeQuoryRequestHandler: mocks.create,
}));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  mocks.get.mockResolvedValue({ _id: "a" });
});

it("disposes a handler when session schema initialization fails", async () => {
  const request = Object.assign(
    vi.fn().mockRejectedValue(new Error("schema failed")),
    {
      dispose: vi.fn().mockResolvedValue(undefined),
    },
  );
  mocks.create.mockResolvedValue(request);
  const { connectQuorySession, getQuorySession } =
    await import("./quorySession");
  await expect(connectQuorySession("a")).rejects.toThrow("schema failed");
  expect(request.dispose).toHaveBeenCalledTimes(1);
  await expect(getQuorySession()).rejects.toThrow("Connect");
});

it("refreshes both request and AI schema metadata without opening another driver", async () => {
  const schemas = [{ name: "changed", tables: [] }];
  const request = Object.assign(vi.fn().mockResolvedValue({ schemas: [] }), {
    dispose: vi.fn().mockResolvedValue(undefined),
    refreshSchema: vi.fn().mockResolvedValue(schemas),
    invalidateSchema: vi.fn(),
  });
  mocks.create.mockResolvedValue(request);
  const state = await import("./quorySession");
  await state.connectQuorySession("a");
  await state.invalidateQuorySchema();
  expect((await state.getQuorySession()).schemas).toEqual(schemas);
  expect(request.invalidateSchema).toHaveBeenCalledTimes(1);
  expect(mocks.create).toHaveBeenCalledTimes(1);
  await state.shutdownQuorySessions();
  expect(request.dispose).toHaveBeenCalledTimes(1);
});

import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  validate: vi.fn(),
  invalidate: vi.fn(),
  active: "project",
  session: true,
  update: vi.fn(),
}));
vi.mock("./projectRepo", () => ({
  projectRepo: { get: mocks.get, put: mocks.put },
}));
vi.mock("../state/activeProjectState", () => ({
  activeProjectState: {
    getActiveProject: () => ({ _id: mocks.active }),
    updateMetadata: mocks.update,
  },
}));
vi.mock("../state/quorySession", () => ({
  quorySessions: {
    get connectionId() {
      return mocks.session ? "connection" : undefined;
    },
    get: async () => ({ request: { validateSchemaOptions: mocks.validate } }),
  },
  invalidateQuorySchema: mocks.invalidate,
}));
import { saveProjectConfiguration } from "./projectConfigurationService";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.active = "project";
  mocks.session = true;
  mocks.get.mockResolvedValue({
    _id: "project",
    _rev: "1-project",
    name: "Project",
    storage: "database",
  });
  mocks.put.mockResolvedValue({ rev: "2-project" });
});

it("validates on the current connection before publishing project settings and invalidates the schema", async () => {
  const configuration = {
    inferRelationships: true,
    minimumRelationshipConfidence: 0.9,
  };
  expect(
    await saveProjectConfiguration("project", "1-project", configuration),
  ).toEqual({ revision: "2-project" });
  expect(mocks.validate).toHaveBeenCalledWith(configuration);
  expect(mocks.put).toHaveBeenCalledWith(
    expect.objectContaining({ configuration }),
  );
  expect(mocks.update).toHaveBeenCalledWith(
    expect.objectContaining({ configuration, _rev: "2-project" }),
  );
  expect(mocks.invalidate).toHaveBeenCalledOnce();
});

it("does not persist invalid manual relationships or invalidate a valid session", async () => {
  mocks.validate.mockRejectedValue(
    new Error("Missing columns or incompatible data types."),
  );
  await expect(
    saveProjectConfiguration("project", "1-project", { relationships: [] }),
  ).rejects.toThrow("incompatible");
  expect(mocks.put).not.toHaveBeenCalled();
  expect(mocks.invalidate).not.toHaveBeenCalled();
});

it("keeps another project's live connection untouched when configuring an inactive project", async () => {
  mocks.active = "other";
  await saveProjectConfiguration("project", "1-project", {
    inferRelationships: true,
  });
  expect(mocks.put).toHaveBeenCalledOnce();
  expect(mocks.validate).not.toHaveBeenCalled();
  expect(mocks.invalidate).not.toHaveBeenCalled();
});

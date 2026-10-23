import { beforeEach, expect, it, vi } from "vitest";
import { defaultPreferences } from "../../shared/settings";

const mocks = vi.hoisted(() => ({
  clipboard: vi.fn(),
  openExternal: vi.fn(),
  openPath: vi.fn(),
  saveAI: vi.fn(),
  removeKey: vi.fn(),
  savePreferences: vi.fn(),
  environment: vi.fn(() => ({ OPENAI_API_KEY: "saved-secret" })),
  generate: vi.fn(),
  model: vi.fn(),
  telemetry: vi.fn(),
  appearance: vi.fn(),
}));
vi.mock("electron", () => ({
  app: { getVersion: () => "1.0.10", getPath: () => "/tmp/quory-test-logs" },
  clipboard: { writeText: mocks.clipboard },
  shell: { openExternal: mocks.openExternal, openPath: mocks.openPath },
}));
vi.mock("../settings", () => ({
  secureStorageAvailable: () => true,
  settingsStore: () => ({
    ai: () => ({
      provider: "openai",
      model: "test-model",
      hasSavedKey: true,
      hasEnvironmentKey: false,
    }),
    preferences: () => defaultPreferences,
    saveAI: mocks.saveAI,
    removeKey: mocks.removeKey,
    savePreferences: mocks.savePreferences,
    environment: mocks.environment,
  }),
}));
vi.mock("../telemetry", () => ({ configureTelemetry: mocks.telemetry }));
vi.mock("../settings/appearance", () => ({
  applyNativeAppearance: mocks.appearance,
}));
vi.mock("../ai/model", () => ({ getQueryModel: mocks.model }));
vi.mock("ai", () => ({ generateText: mocks.generate }));
import router from "./settingsRouter";
const caller = router.createCaller({});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.generate.mockResolvedValue({ text: "OK" });
});

it("returns key status without returning credentials, and copies only safe diagnostics", async () => {
  const settings = await caller.get();
  expect(settings.ai.hasSavedKey).toBe(true);
  expect(JSON.stringify(settings)).not.toContain("saved-secret");
  await caller.copyDiagnostics();
  const diagnostic = JSON.parse(mocks.clipboard.mock.calls[0]![0]);
  expect(Object.keys(diagnostic).sort()).toEqual(
    [
      "app",
      "arch",
      "node",
      "platform",
      "version",
      ...(process.versions.electron ? ["electron"] : []),
    ].sort(),
  );
  expect(JSON.stringify(diagnostic)).not.toContain("saved-secret");
});
it("applies appearance and independent telemetry preferences after persistence", async () => {
  const preferences = {
    ...defaultPreferences,
    privacy: { analytics: false, errors: true },
  };
  await caller.savePreferences(preferences);
  expect(mocks.savePreferences).toHaveBeenCalledWith(preferences);
  expect(mocks.appearance).toHaveBeenCalledWith(preferences.appearance);
  expect(mocks.telemetry).toHaveBeenCalledWith(preferences.privacy);
});
it("tests with the saved main-process credentials and redacts provider failures", async () => {
  expect(await caller.testAI()).toEqual({
    success: true,
    message: "Connection successful.",
  });
  expect(mocks.model).toHaveBeenCalledWith({ OPENAI_API_KEY: "saved-secret" });
  mocks.generate.mockRejectedValue(
    new Error("Authorization Bearer saved-secret"),
  );
  const result = await caller.testAI();
  expect(result.success).toBe(false);
  expect(result.message).not.toContain("saved-secret");
});
it("rejects arbitrary external URLs and invalid setting values", async () => {
  await expect(caller.openLink("file:///private" as "docs")).rejects.toThrow();
  expect(mocks.openExternal).not.toHaveBeenCalled();
  await expect(
    caller.saveAI({ provider: "openai", model: "" }),
  ).rejects.toThrow();
  expect(mocks.saveAI).not.toHaveBeenCalled();
  await caller.openLink("updates");
  expect(mocks.openExternal).toHaveBeenCalledWith(
    "https://github.com/CNimmo16/quory/releases/latest",
  );
});

import { describe, expect, it, vi } from "vitest";
import { createSettingsStore } from "./store";
import { defaultPreferences } from "../../shared/settings";

function fixture(env: NodeJS.ProcessEnv = {}) {
  let persisted: unknown;
  const io = {
    read: () => persisted,
    write: vi.fn((value: unknown) => {
      persisted = structuredClone(value);
    }),
    encrypt: vi.fn((key: string) => Buffer.from(key).toString("base64")),
    decrypt: vi.fn((key: string) => Buffer.from(key, "base64").toString()),
  };
  return {
    io,
    store: createSettingsStore(io, env),
    restart: () => createSettingsStore(io, env),
  };
}
describe("global settings", () => {
  it("encrypts keys before persistence and never exposes them in public settings", () => {
    const { store, io, restart } = fixture();
    store.saveAI({
      provider: "openai",
      model: "model-a",
      apiKey: "secret-api-key",
    });
    expect(io.encrypt).toHaveBeenCalledWith("secret-api-key");
    expect(JSON.stringify(io.write.mock.calls)).not.toContain("secret-api-key");
    expect(store.ai()).toMatchObject({
      provider: "openai",
      model: "model-a",
      hasSavedKey: true,
      hasEnvironmentKey: false,
    });
    expect(JSON.stringify(store.ai())).not.toContain("secret-api-key");
    expect(restart().environment().OPENAI_API_KEY).toBe("secret-api-key");
  });
  it("retains separate provider keys, replaces them, and supports removal", () => {
    const { store } = fixture({ OPENAI_API_KEY: "environment-key" });
    store.saveAI({ provider: "openai", model: "a", apiKey: "saved-a" });
    store.saveAI({ provider: "anthropic", model: "b", apiKey: "saved-b" });
    expect(store.environment().ANTHROPIC_API_KEY).toBe("saved-b");
    store.saveAI({ provider: "openai", model: "c" });
    expect(store.environment().OPENAI_API_KEY).toBe("saved-a");
    store.saveAI({ provider: "openai", model: "c", apiKey: "replacement" });
    expect(store.environment().OPENAI_API_KEY).toBe("replacement");
    store.removeKey("openai");
    expect(store.environment().OPENAI_API_KEY).toBe("environment-key");
    expect(store.ai().hasSavedKey).toBe(false);
  });
  it("restores provider models and keys independently across restarts", () => {
    const { store, restart } = fixture();
    store.saveAI({
      provider: "openai",
      model: "openai-model",
      apiKey: "key-one",
    });
    store.saveAI({
      provider: "anthropic",
      model: "claude-model",
      apiKey: "key-two",
    });
    const restored = restart();
    expect(restored.ai().profiles.openai).toMatchObject({
      model: "openai-model",
      hasSavedKey: true,
    });
    expect(restored.ai().profiles.anthropic).toMatchObject({
      model: "claude-model",
      hasSavedKey: true,
    });
    restored.saveAI({
      provider: "openai",
      model: restored.ai().profiles.openai.model,
    });
    expect(restored.environment().OPENAI_API_KEY).toBe("key-one");
    expect(restored.ai().profiles.anthropic.hasSavedKey).toBe(true);
  });
  it("binds custom keys to their endpoint and keeps them separate from OpenAI", () => {
    const { store } = fixture({ OPENAI_API_KEY: "official-key" });
    store.saveAI({
      provider: "custom",
      baseURL: "http://localhost:1234/v1/",
      model: "local-model",
      apiKey: "local-key",
    });
    expect(store.environment()).toMatchObject({
      AI_PROVIDER: "custom",
      AI_BASE_URL: "http://localhost:1234/v1",
      CUSTOM_OPENAI_API_KEY: "local-key",
    });
    expect(
      store.credential("custom", "https://different.example/v1"),
    ).toBeUndefined();
    store.saveAI({
      provider: "custom",
      baseURL: "https://different.example/v1",
      model: "remote-model",
    });
    expect(store.environment().CUSTOM_OPENAI_API_KEY).toBeUndefined();
    expect(store.credential("openai")).toBe("official-key");
    store.saveAI({
      provider: "custom",
      baseURL: "http://localhost:1234/v1",
      model: "local-model",
    });
    expect(store.environment().CUSTOM_OPENAI_API_KEY).toBe("local-key");
    store.removeKey("custom", "http://localhost:1234/v1");
    expect(store.environment().CUSTOM_OPENAI_API_KEY).toBeUndefined();
  });
  it("migrates previously saved provider keys and the selected model without exposing keys", () => {
    const io = {
      read: () => ({
        preferences: defaultPreferences,
        ai: {
          provider: "anthropic",
          model: "existing-model",
          keys: { openai: "encrypted-one", anthropic: "encrypted-two" },
        },
      }),
      write: vi.fn(),
      encrypt: vi.fn(),
      decrypt: (value: string) => `unlocked:${value}`,
    };
    const store = createSettingsStore(io, {});
    expect(store.ai().profiles.anthropic).toMatchObject({
      model: "existing-model",
      hasSavedKey: true,
    });
    expect(store.ai().profiles.openai.hasSavedKey).toBe(true);
    expect(store.environment().ANTHROPIC_API_KEY).toBe(
      "unlocked:encrypted-two",
    );
    store.saveAI({ provider: "openai", model: "new-model" });
    expect(store.environment().OPENAI_API_KEY).toBe("unlocked:encrypted-one");
    expect(JSON.stringify(store.ai())).not.toContain("encrypted-");
  });
  it("does not save a key or alter previous settings if encryption fails", () => {
    const { store, io } = fixture();
    io.encrypt.mockImplementation(() => {
      throw new Error("Keychain locked");
    });
    expect(() =>
      store.saveAI({ provider: "openai", model: "a", apiKey: "secret" }),
    ).toThrow("Keychain locked");
    expect(io.write).not.toHaveBeenCalled();
    expect(store.ai().hasSavedKey).toBe(false);
  });
  it("does not silently fall back if a saved key cannot be decrypted", () => {
    const { store, io } = fixture({ OPENAI_API_KEY: "environment-key" });
    store.saveAI({ provider: "openai", model: "a", apiKey: "secret" });
    io.decrypt.mockImplementation(() => {
      throw new Error("secret internal crypto detail");
    });
    expect(() => store.environment()).toThrow(
      "Could not unlock the saved AI key",
    );
    expect(() => store.environment()).not.toThrow(
      "secret internal crypto detail",
    );
  });
  it("persists appearance and independent privacy preferences across restarts", () => {
    const { store, restart } = fixture();
    store.savePreferences({
      appearance: { theme: "dark", editorFontSize: 18, density: "compact" },
      privacy: { analytics: false, errors: true },
    });
    expect(restart().preferences()).toEqual({
      appearance: { theme: "dark", editorFontSize: 18, density: "compact" },
      privacy: { analytics: false, errors: true },
    });
  });
  it("validates preferences and keeps the old state if disk writes fail", () => {
    const { store, io } = fixture();
    expect(() =>
      store.savePreferences({
        ...defaultPreferences,
        appearance: { ...defaultPreferences.appearance, editorFontSize: 500 },
      }),
    ).toThrow();
    io.write.mockImplementation(() => {
      throw new Error("Disk full");
    });
    expect(() =>
      store.savePreferences({
        ...defaultPreferences,
        privacy: { analytics: false, errors: false },
      }),
    ).toThrow("Disk full");
    expect(store.preferences()).toEqual(defaultPreferences);
  });
});

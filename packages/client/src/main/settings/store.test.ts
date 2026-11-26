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
  it("encrypts provider keys without changing either model selection", () => {
    const { store, io, restart } = fixture();
    const before = store.ai();
    store.saveProvider({ provider: "typesafe", apiKey: "secret-api-key" });
    expect(io.encrypt).toHaveBeenCalledWith("secret-api-key");
    expect(JSON.stringify(io.write.mock.calls)).not.toContain("secret-api-key");
    expect(store.ai().assistant).toEqual(before.assistant);
    expect(store.ai().decision).toBeNull();
    expect(store.ai().providers.typesafe.hasSavedKey).toBe(true);
    expect(JSON.stringify(store.ai())).not.toContain("secret-api-key");
    expect(restart().credential("typesafe")).toBe("secret-api-key");
  });
  it("saves independent models sharing one provider key and supports disabling decisions", () => {
    const { store, restart } = fixture();
    store.saveProvider({ provider: "openai", apiKey: "shared-secret" });
    store.saveAI({
      purpose: "assistant",
      selection: { provider: "openai", model: "assistant-model" },
    });
    store.saveAI({
      purpose: "decision",
      selection: { provider: "openai", model: "gpt-6-luna" },
    });
    const restored = restart();
    expect(restored.ai().assistant.model).toBe("assistant-model");
    expect(restored.ai().decision?.model).toBe("gpt-6-luna");
    expect(restored.environment().OPENAI_API_KEY).toBe("shared-secret");
    restored.saveProvider({ provider: "typesafe", apiKey: "jev-secret" });
    restored.saveAI({
      purpose: "decision",
      selection: { provider: "typesafe", model: "jev-latest" },
    });
    expect(restored.environment().AI_MODEL).toBe("assistant-model");
    expect(restored.credential("typesafe")).toBe("jev-secret");
    restored.saveAI({ purpose: "decision", selection: null });
    expect(restored.ai().decision).toBeNull();
    expect(restored.ai().providers.typesafe.hasSavedKey).toBe(true);
  });
  it("retains separate provider keys, replaces them, and supports removal", () => {
    const { store } = fixture({ OPENAI_API_KEY: "environment-key" });
    store.saveProvider({ provider: "openai", apiKey: "saved-a" });
    store.saveProvider({ provider: "anthropic", apiKey: "saved-b" });
    store.saveAI({
      purpose: "assistant",
      selection: { provider: "anthropic", model: "claude-model" },
    });
    expect(store.environment().ANTHROPIC_API_KEY).toBe("saved-b");
    store.saveProvider({ provider: "openai", apiKey: "replacement" });
    expect(store.credential("openai")).toBe("replacement");
    expect(store.ai().assistant.provider).toBe("anthropic");
    store.removeKey("openai");
    expect(store.credential("openai")).toBe("environment-key");
    expect(store.ai().providers.openai.hasSavedKey).toBe(false);
  });
  it("binds custom keys to the normalized endpoint and never reuses a different endpoint's key", () => {
    const { store, restart } = fixture({
      OPENAI_API_KEY: "official-key",
      AI_BASE_URL: "http://localhost:1234/v1",
      CUSTOM_OPENAI_API_KEY: "env-local",
    });
    store.saveProvider({
      provider: "custom",
      baseURL: "http://localhost:1234/v1/",
      apiKey: "local-key",
    });
    store.saveAI({
      purpose: "assistant",
      selection: { provider: "custom", model: "local-model" },
    });
    expect(restart().environment()).toMatchObject({
      AI_BASE_URL: "http://localhost:1234/v1",
      CUSTOM_OPENAI_API_KEY: "local-key",
    });
    store.saveProvider({
      provider: "custom",
      baseURL: "https://different.example/v1",
    });
    expect(store.environment().CUSTOM_OPENAI_API_KEY).toBeUndefined();
    expect(store.credential("openai")).toBe("official-key");
    store.saveProvider({
      provider: "custom",
      baseURL: "http://localhost:1234/v1",
    });
    expect(store.environment().CUSTOM_OPENAI_API_KEY).toBe("local-key");
    store.removeKey("custom");
    expect(store.environment().CUSTOM_OPENAI_API_KEY).toBe("env-local");
  });
  it.each([
    {
      provider: "anthropic",
      model: "existing-model",
      keys: { anthropic: "encrypted-two" },
    },
    {
      provider: "anthropic",
      profiles: {
        anthropic: { model: "existing-model" },
        custom: { model: "local-model", baseURL: "http://localhost:1234/v1/" },
      },
      keys: {
        anthropic: "encrypted-two",
        "custom:http://localhost:1234/v1": "encrypted-local",
      },
    },
  ])(
    "migrates earlier saved settings and retains encrypted keys across subsequent writes",
    (legacy) => {
      let persisted: unknown = { preferences: defaultPreferences, ai: legacy };
      const io = {
        read: () => persisted,
        write: (value: unknown) => {
          persisted = value;
        },
        encrypt: vi.fn(),
        decrypt: (value: string) => `unlocked:${value}`,
      };
      const store = createSettingsStore(io, {});
      expect(store.ai().assistant).toEqual({
        provider: "anthropic",
        model: "existing-model",
      });
      expect(store.ai().decision).toBeNull();
      expect(store.environment().ANTHROPIC_API_KEY).toBe(
        "unlocked:encrypted-two",
      );
      store.saveAI({
        purpose: "decision",
        selection: { provider: "google", model: "gemini-decision-1" },
      });
      const restored = createSettingsStore(io, {});
      expect(restored.environment().ANTHROPIC_API_KEY).toBe(
        "unlocked:encrypted-two",
      );
      expect(restored.ai().assistant.model).toBe("existing-model");
      if ("profiles" in legacy) {
        expect(restored.ai().assistantModels.custom).toBe("local-model");
        expect(
          restored.credential("custom", restored.ai().providers.custom.baseURL),
        ).toBe("unlocked:encrypted-local");
      }
      expect(io.encrypt).not.toHaveBeenCalled();
      expect(JSON.stringify(restored.ai())).not.toContain("encrypted-");
    },
  );
  it("does not alter previous settings if encryption or persistence fails", () => {
    const { store, io } = fixture();
    const before = store.ai();
    io.encrypt.mockImplementation(() => {
      throw new Error("Keychain locked");
    });
    expect(() =>
      store.saveProvider({ provider: "typesafe", apiKey: "secret" }),
    ).toThrow("Keychain locked");
    expect(io.write).not.toHaveBeenCalled();
    expect(store.ai()).toEqual(before);
    io.write.mockImplementation(() => {
      throw new Error("Disk full");
    });
    expect(() =>
      store.saveAI({
        purpose: "decision",
        selection: { provider: "openai", model: "gpt-6-luna" },
      }),
    ).toThrow("Disk full");
    expect(store.ai()).toEqual(before);
  });
  it("does not silently fall back if a saved key cannot be decrypted", () => {
    const { store, io } = fixture({ OPENAI_API_KEY: "environment-key" });
    store.saveProvider({ provider: "openai", apiKey: "secret" });
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
  it("rejects chat-only providers and models for decisions", () => {
    const { store } = fixture();
    expect(() =>
      store.saveAI({
        purpose: "decision",
        selection: { provider: "openai", model: "gpt-chat" },
      }),
    ).toThrow("supported decision model");
    expect(() =>
      store.saveAI({
        purpose: "assistant",
        selection: { provider: "custom", model: "local" },
      }),
    ).toThrow("API base URL");
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

it("persists a Cloudflare account with an encrypted token without changing models", () => {
  const { store, restart, io } = fixture();
  const before = store.ai().assistant;
  store.saveProvider({
    provider: "cloudflare",
    apiKey: "cf-token",
    accountId: "a".repeat(32),
  });
  expect(io.encrypt).toHaveBeenCalledWith("cf-token");
  expect(restart().ai().providers.cloudflare).toEqual({
    accountId: "a".repeat(32),
    hasSavedKey: true,
    hasEnvironmentKey: false,
  });
  expect(restart().credential("cloudflare")).toBe("cf-token");
  expect(store.ai().assistant).toEqual(before);
  store.saveAI({
    purpose: "decision",
    selection: { provider: "cloudflare", model: "@cf/cloudflare/clef-flash" },
  });
  expect(restart().ai().decision?.model).toBe("@cf/cloudflare/clef-flash");
  store.removeKey("cloudflare");
  expect(store.ai().providers.cloudflare.hasSavedKey).toBe(false);
  expect(store.ai().providers.cloudflare.accountId).toBe("a".repeat(32));
});
it("supports Cloudflare environment credentials and rejects malformed account IDs atomically", () => {
  const { store, io } = fixture({
    CLOUDFLARE_ACCOUNT_ID: "b".repeat(32),
    CLOUDFLARE_API_TOKEN: "env-token",
  });
  expect(store.ai().providers.cloudflare).toMatchObject({
    accountId: "b".repeat(32),
    hasEnvironmentKey: true,
  });
  expect(store.credential("cloudflare")).toBe("env-token");
  expect(() =>
    store.saveProvider({
      provider: "cloudflare",
      accountId: "../bad",
      apiKey: "new-token",
    }),
  ).toThrow();
  expect(io.encrypt).not.toHaveBeenCalled();
  expect(io.write).not.toHaveBeenCalled();
});

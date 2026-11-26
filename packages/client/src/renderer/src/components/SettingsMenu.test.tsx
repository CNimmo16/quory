import {
  render,
  screen,
  waitFor,
  fireEvent,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { SettingsMenu } from "./SettingsMenu";
import { SettingsContext } from "./SettingsProvider";
import { defaultPreferences } from "../../../shared/settings";
import { createSettingsStore } from "../../../main/settings/store";
import type { ComponentProps } from "react";

const mocks = vi.hoisted(() => ({
  saveAI: vi.fn(),
  saveProvider: vi.fn(),
  testDecision: vi.fn(),
  preferences: vi.fn(),
  remove: vi.fn(),
  test: vi.fn(),
  link: vi.fn(),
  logs: vi.fn(),
  copy: vi.fn(),
  refresh: vi.fn(),
  models: vi.fn(),
}));
vi.mock("../util/tprc", () => ({
  default: {
    settings: {
      models: { useMutation: () => ({ mutateAsync: mocks.models }) },
      saveProvider: {
        useMutation: () => ({ mutateAsync: mocks.saveProvider }),
      },
      testDecision: {
        useMutation: () => ({ mutateAsync: mocks.testDecision }),
      },
      saveAI: { useMutation: () => ({ mutateAsync: mocks.saveAI }) },
      savePreferences: {
        useMutation: () => ({ mutateAsync: mocks.preferences }),
      },
      removeKey: { useMutation: () => ({ mutateAsync: mocks.remove }) },
      testAI: { useMutation: () => ({ mutateAsync: mocks.test }) },
      openLink: { useMutation: () => ({ mutateAsync: mocks.link }) },
      openLogs: { useMutation: () => ({ mutateAsync: mocks.logs }) },
      copyDiagnostics: { useMutation: () => ({ mutateAsync: mocks.copy }) },
    },
  },
}));
let store: ReturnType<typeof createSettingsStore>;
beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollTo = vi.fn();
  store = createSettingsStore(
    {
      read: () => ({
        preferences: defaultPreferences,
        ai: {
          provider: "openai",
          keys: { openai: "saved", anthropic: "saved", google: "saved" },
          profiles: {
            openai: { model: "test-model" },
            anthropic: { model: "saved-claude" },
            google: { model: "saved-gemini" },
          },
        },
      }),
      write: vi.fn(),
      encrypt: (value) => `encrypted:${value}`,
      decrypt: () => "secret",
    },
    {},
  );
  mocks.saveAI.mockImplementation(async (input) => {
    store.saveAI(input);
    return store.ai();
  });
  mocks.saveProvider.mockImplementation(async (input) => {
    store.saveProvider(input);
    return store.ai();
  });
  mocks.remove.mockImplementation(async (input) => {
    store.removeKey(
      typeof input === "string" ? input : input.provider,
      typeof input === "string" ? undefined : input.baseURL,
    );
    return store.ai();
  });
  mocks.models.mockImplementation(async (input) =>
    input.purpose === "decision"
      ? {
          models:
            input.provider === "typesafe"
              ? [{ id: "jev-latest", name: "Jev latest" }]
              : [{ id: "gpt-6-luna", name: "GPT-6 Luna" }],
          source: "documented",
        }
      : {
          models: [
            { id: "test-model", name: "Test model" },
            { id: "second-model", name: "Second model" },
          ],
          source: "provider",
        },
  );
  mocks.refresh.mockResolvedValue({});
  mocks.preferences.mockResolvedValue({});
  mocks.test.mockResolvedValue({
    success: true,
    message: "Connection successful.",
  });
  mocks.testDecision.mockResolvedValue({
    success: true,
    message: "Decision connection successful.",
  });
});
function setup(secureStorageAvailable = true, hasEnvironmentKey = false) {
  const data = {
    preferences: defaultPreferences,
    ai: {
      ...store.ai(),
      providers: {
        ...store.ai().providers,
        openai: { ...store.ai().providers.openai, hasEnvironmentKey },
      },
    },
    secureStorageAvailable,
    version: "1.0.10",
    platform: "darwin",
  };
  const value = { data, refetch: mocks.refresh } as unknown as ComponentProps<
    typeof SettingsContext.Provider
  >["value"];
  render(
    <SettingsContext.Provider value={value}>
      <SettingsMenu />
    </SettingsContext.Provider>,
  );
  return userEvent.setup();
}
it("opens globally with the keyboard shortcut and keeps saved keys hidden", async () => {
  const user = setup();
  fireEvent.keyDown(window, { key: ",", metaKey: true });
  expect(await screen.findByRole("dialog")).toBeVisible();
  expect(screen.getByRole("dialog").style.transformOrigin).toBe("center");
  await user.click(
    screen.getByRole("button", { name: "Edit OpenAI credentials" }),
  );
  expect(screen.getByLabelText("API key")).toHaveValue("");
  expect(
    screen.getByRole("button", { name: "Test Quory connection" }),
  ).toBeEnabled();
});
it("opens toward the cog and uses the center for the keyboard shortcut", async () => {
  const user = setup();
  const trigger = screen.getByRole("button", { name: "Settings" });
  vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
    left: window.innerWidth - 50,
    top: 8,
    width: 28,
    height: 28,
  } as DOMRect);
  await user.click(trigger);
  const dialog = screen.getByRole("dialog");
  expect(dialog.style.getPropertyValue("--settings-enter-x")).toBe("24px");
  expect(dialog.style.getPropertyValue("--settings-enter-y")).toBe("-16px");
  expect(dialog.style.transformOrigin).not.toBe("center");
  await user.keyboard("{Escape}");
  fireEvent.keyDown(window, { key: ",", ctrlKey: true });
  expect(screen.getByRole("dialog").style.transformOrigin).toBe("center");
});
it("does not display implementation details about environment keys", async () => {
  const user = setup(true, true);
  await user.click(screen.getByRole("button", { name: "Settings" }));
  expect(screen.queryByText(/environment key/i)).toBeNull();
});
it("saves a replacement key, clears the input, and refreshes settings", async () => {
  const user = setup();
  await user.click(screen.getByRole("button", { name: "Settings" }));
  await user.click(
    screen.getByRole("button", { name: "Edit OpenAI credentials" }),
  );
  await user.type(screen.getByLabelText("API key"), "replacement-key");
  expect(
    screen.getByRole("button", { name: "Test Quory connection" }),
  ).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Save provider" }));
  await waitFor(() =>
    expect(mocks.saveProvider).toHaveBeenCalledWith({
      provider: "openai",
      apiKey: "replacement-key",
    }),
  );
  await waitFor(() => expect(screen.getByLabelText("API key")).toHaveValue(""));
  expect(mocks.refresh).toHaveBeenCalled();
});
it("prevents saving keys without secure storage and allows removing a saved key", async () => {
  const user = setup(false);
  await user.click(screen.getByRole("button", { name: "Settings" }));
  await user.click(
    screen.getByRole("button", { name: "Edit OpenAI credentials" }),
  );
  await user.type(screen.getByLabelText("API key"), "new-key");
  expect(screen.getByRole("button", { name: "Save provider" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Remove saved key" }));
  await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("openai"));
});
it("saves appearance and independent privacy choices, and opens About actions", async () => {
  const user = setup();
  await user.click(screen.getByRole("button", { name: "Settings" }));
  await user.click(screen.getByRole("button", { name: "Appearance" }));
  await user.selectOptions(screen.getByLabelText("Theme"), "dark");
  await waitFor(() =>
    expect(mocks.preferences).toHaveBeenCalledWith({
      ...defaultPreferences,
      appearance: { ...defaultPreferences.appearance, theme: "dark" },
    }),
  );
  await waitFor(() => expect(screen.queryByText("Working…")).toBeNull());
  await user.click(
    screen.getByRole("button", { name: "Privacy & diagnostics" }),
  );
  await user.click(
    screen.getByRole("checkbox", { name: /Share usage analytics/ }),
  );
  await waitFor(() =>
    expect(mocks.preferences).toHaveBeenLastCalledWith({
      ...defaultPreferences,
      privacy: { analytics: false, errors: true },
    }),
  );
  await waitFor(() => expect(screen.queryByText("Working…")).toBeNull());
  await user.click(
    screen.getByRole("button", { name: "Copy diagnostic information" }),
  );
  await waitFor(() => expect(mocks.copy).toHaveBeenCalled());
  await user.click(screen.getByRole("button", { name: "About" }));
  expect(screen.getByText("Version 1.0.10 · darwin")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Check for updates" }));
  await waitFor(() => expect(mocks.link).toHaveBeenCalledWith("updates"));
});
it("changes model providers independently of provider credentials", async () => {
  const user = setup();
  await user.click(screen.getByRole("button", { name: "Settings" }));
  expect(
    await screen.findByRole("option", { name: "Second model — second-model" }),
  ).toBeVisible();
  await user.selectOptions(
    screen.getByLabelText("Quory provider"),
    "anthropic",
  );
  expect(screen.getByLabelText("Quory model")).toHaveValue("saved-claude");
  expect(screen.queryByRole("combobox", { name: "Provider" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Save Quory model" }));
  await waitFor(() =>
    expect(mocks.saveAI).toHaveBeenCalledWith({
      purpose: "assistant",
      selection: { provider: "anthropic", model: "saved-claude" },
    }),
  );
  expect(mocks.saveProvider).not.toHaveBeenCalled();
  await user.selectOptions(screen.getByLabelText("Quory provider"), "openai");
  expect(screen.getByLabelText("Quory model")).toHaveValue("test-model");
});
it("keeps manual model entry available when model discovery fails", async () => {
  mocks.models.mockRejectedValue(new Error("unavailable"));
  const user = setup();
  await user.click(screen.getByRole("button", { name: "Settings" }));
  expect(await screen.findByText(/Could not load models/)).toBeVisible();
  await user.selectOptions(screen.getByLabelText("Quory model"), "__manual__");
  await user.clear(screen.getByLabelText("Manual model ID"));
  await user.type(screen.getByLabelText("Manual model ID"), "my-custom-model");
  await user.click(screen.getByRole("button", { name: "Save Quory model" }));
  await waitFor(() =>
    expect(mocks.saveAI).toHaveBeenCalledWith({
      purpose: "assistant",
      selection: { provider: "openai", model: "my-custom-model" },
    }),
  );
});
it("configures a custom endpoint separately, then selects an assistant model", async () => {
  const user = setup();
  await user.click(screen.getByRole("button", { name: "Settings" }));
  await user.click(
    screen.getByRole("button", {
      name: "Edit Custom (OpenAI-compatible) credentials",
    }),
  );
  await user.type(
    screen.getByLabelText("API base URL"),
    "http://localhost:1234/v1/",
  );
  await user.click(screen.getByRole("button", { name: "Save provider" }));
  await waitFor(() =>
    expect(mocks.saveProvider).toHaveBeenCalledWith({
      provider: "custom",
      baseURL: "http://localhost:1234/v1",
    }),
  );
  expect(mocks.saveAI).not.toHaveBeenCalled();
  await user.selectOptions(screen.getByLabelText("Quory provider"), "custom");
  await user.selectOptions(screen.getByLabelText("Quory model"), "__manual__");
  await user.type(
    screen.getByLabelText("Manual model ID"),
    "local/model:latest",
  );
  await user.click(screen.getByRole("button", { name: "Save Quory model" }));
  await waitFor(() =>
    expect(mocks.saveAI).toHaveBeenCalledWith({
      purpose: "assistant",
      selection: { provider: "custom", model: "local/model:latest" },
    }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Test Quory connection" }),
    ).toBeEnabled(),
  );
});
it("does not replace the current provider's models with a late response from the previous provider", async () => {
  let resolveFirst: (value: unknown) => void = () => {};
  mocks.models.mockImplementation((input) =>
    input.provider === "openai"
      ? new Promise((resolve) => {
          resolveFirst = resolve;
        })
      : Promise.resolve({
          source: "provider",
          models: [{ id: "anthropic-live", name: "Anthropic live" }],
        }),
  );
  const user = setup();
  await user.click(screen.getByRole("button", { name: "Settings" }));
  await waitFor(() =>
    expect(mocks.models).toHaveBeenCalledWith({
      provider: "openai",
      purpose: "assistant",
    }),
  );
  await user.selectOptions(
    screen.getByLabelText("Quory provider"),
    "anthropic",
  );
  expect(
    await screen.findByRole("option", {
      name: "Anthropic live — anthropic-live",
    }),
  ).toBeVisible();
  resolveFirst({
    source: "provider",
    models: [{ id: "openai-late", name: "Late" }],
  });
  await waitFor(() =>
    expect(
      screen.queryByRole("option", { name: "Late — openai-late" }),
    ).toBeNull(),
  );
  expect(screen.getByLabelText("Quory model")).toHaveValue("saved-claude");
});

it("saves and tests TypeSafe decisions independently, then disables them without removing credentials", async () => {
  const user = setup();
  await user.click(screen.getByRole("button", { name: "Settings" }));
  await user.click(
    screen.getByRole("button", { name: "Edit TypeSafe / Jev credentials" }),
  );
  await user.type(screen.getByLabelText("API key"), "jev-secret");
  await user.click(screen.getByRole("button", { name: "Save provider" }));
  await waitFor(() => expect(screen.getByLabelText("API key")).toHaveValue(""));
  expect(screen.getByLabelText("Quory provider")).toHaveValue("openai");
  await user.click(
    screen.getByRole("checkbox", { name: "Enable decision model" }),
  );
  await user.selectOptions(
    screen.getByLabelText("Decision provider"),
    "typesafe",
  );
  await user.click(screen.getByRole("button", { name: "Save decision model" }));
  await waitFor(() =>
    expect(mocks.saveAI).toHaveBeenCalledWith({
      purpose: "decision",
      selection: { provider: "typesafe", model: "jev-latest" },
    }),
  );
  await user.click(
    screen.getByRole("button", { name: "Test decision connection" }),
  );
  await waitFor(() => expect(mocks.testDecision).toHaveBeenCalled());
  expect(mocks.test).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("checkbox", { name: "Enable decision model" }),
  );
  await user.click(screen.getByRole("button", { name: "Save decision model" }));
  await waitFor(() =>
    expect(mocks.saveAI).toHaveBeenLastCalledWith({
      purpose: "decision",
      selection: null,
    }),
  );
  expect(store.ai().providers.typesafe.hasSavedKey).toBe(true);
  expect(store.ai().assistant.model).toBe("test-model");
});

it("shows all provider credential states without selecting a provider to use", async () => {
  const user = setup();
  await user.click(screen.getByRole("button", { name: "Settings" }));
  const list = screen.getByRole("list", { name: "Provider connections" });
  expect(within(list).getAllByRole("listitem")).toHaveLength(6);
  expect(within(list).queryByRole("combobox")).toBeNull();
  expect(within(list).getAllByText("API key configured")).toHaveLength(3);
  expect(within(list).getAllByText(/^No API (key|token)$/)).toHaveLength(3);
  await user.click(
    screen.getByRole("button", { name: "Edit TypeSafe / Jev credentials" }),
  );
  await user.type(screen.getByLabelText("API key"), "new-secret");
  await user.click(screen.getByRole("button", { name: "Save provider" }));
  await waitFor(() =>
    expect(within(list).getAllByText("API key configured")).toHaveLength(4),
  );
  expect(mocks.saveAI).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Remove saved key" }));
  await waitFor(() =>
    expect(within(list).getAllByText(/^No API (key|token)$/)).toHaveLength(3),
  );
});
it("requires a Cloudflare account ID, saves its token, and enables the Clef connection test", async () => {
  const user = setup();
  await user.click(screen.getByRole("button", { name: "Settings" }));
  await user.click(
    screen.getByRole("button", { name: "Edit Cloudflare credentials" }),
  );
  await user.type(screen.getByLabelText("API token"), "cf-secret");
  expect(screen.getByRole("button", { name: "Save provider" })).toBeDisabled();
  await user.type(screen.getByLabelText("Account ID"), "a".repeat(32));
  await user.click(screen.getByRole("button", { name: "Save provider" }));
  await waitFor(() =>
    expect(mocks.saveProvider).toHaveBeenCalledWith({
      provider: "cloudflare",
      accountId: "a".repeat(32),
      apiKey: "cf-secret",
    }),
  );
  expect(screen.getByLabelText("API token")).toHaveValue("");
  await user.click(
    screen.getByRole("checkbox", { name: "Enable decision model" }),
  );
  await user.selectOptions(
    screen.getByLabelText("Decision provider"),
    "cloudflare",
  );
  expect(screen.getByLabelText("Decision model")).toHaveValue(
    "@cf/cloudflare/clef",
  );
  await user.click(screen.getByRole("button", { name: "Save decision model" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Test decision connection" }),
    ).toBeEnabled(),
  );
  await user.click(
    screen.getByRole("button", { name: "Test decision connection" }),
  );
  await waitFor(() => expect(mocks.testDecision).toHaveBeenCalled());
  expect(store.ai().assistant.provider).toBe("openai");
});

it("warns in each model section when its provider lacks a key and clears the warning after saving", async () => {
  store.removeKey("anthropic");
  const user = setup();
  await user.click(screen.getByRole("button", { name: "Settings" }));
  expect(screen.queryByRole("alert")).toBeNull();
  await user.selectOptions(
    screen.getByLabelText("Quory provider"),
    "anthropic",
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Anthropic credentials missing",
  );
  expect(screen.getByRole("alert")).not.toHaveTextContent(/above/);
  await user.click(
    within(screen.getByRole("alert")).getByRole("link", {
      name: "Provider connections",
    }),
  );
  expect(Element.prototype.scrollTo).toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "Provider connections" }),
  ).toHaveAttribute("aria-current", "location");
  expect(screen.getByLabelText("Quory provider")).toHaveValue("anthropic");
  await user.click(
    screen.getByRole("checkbox", { name: "Enable decision model" }),
  );
  await user.selectOptions(
    screen.getByLabelText("Decision provider"),
    "typesafe",
  );
  expect(screen.getAllByRole("alert")).toHaveLength(2);
  expect(screen.getAllByRole("alert")[1]).toHaveTextContent(
    "Add an API key for TypeSafe / Jev",
  );
  await user.click(
    screen.getByRole("button", { name: "Edit TypeSafe / Jev credentials" }),
  );
  await user.type(screen.getByLabelText("API key"), "jev-secret");
  await user.click(screen.getByRole("button", { name: "Save provider" }));
  await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(1));
  await user.selectOptions(screen.getByLabelText("Quory provider"), "openai");
  expect(screen.queryByRole("alert")).toBeNull();
});
it("warns about Cloudflare account and token requirements but permits keyless custom endpoints", async () => {
  store.saveProvider({
    provider: "custom",
    baseURL: "http://localhost:1234/v1",
  });
  const user = setup();
  await user.click(screen.getByRole("button", { name: "Settings" }));
  await user.selectOptions(screen.getByLabelText("Quory provider"), "custom");
  expect(screen.queryByRole("alert")).toBeNull();
  await user.click(
    screen.getByRole("checkbox", { name: "Enable decision model" }),
  );
  await user.selectOptions(
    screen.getByLabelText("Decision provider"),
    "cloudflare",
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Add an API token and account ID for Cloudflare",
  );
  await user.click(
    screen.getByRole("checkbox", { name: "Enable decision model" }),
  );
  expect(screen.queryByRole("alert")).toBeNull();
});

it("jumps between AI subsections without losing credential drafts", async () => {
  const user = setup();
  await user.click(screen.getByRole("button", { name: "Settings" }));
  await user.click(
    screen.getByRole("button", { name: "Edit OpenAI credentials" }),
  );
  await user.type(screen.getByLabelText("API key"), "unsaved-key");
  const decision = document.getElementById("ai-decision")!;
  vi.spyOn(decision, "getBoundingClientRect").mockReturnValue({
    top: 800,
  } as DOMRect);
  const link = screen.getByRole("button", { name: "Decision model" });
  link.focus();
  await user.keyboard("{Enter}");
  expect(Element.prototype.scrollTo).toHaveBeenLastCalledWith(
    expect.objectContaining({ top: 800, behavior: "smooth" }),
  );
  expect(link).toHaveAttribute("aria-current", "location");
  await user.click(
    screen.getByRole("button", { name: "Provider connections" }),
  );
  expect(screen.getByLabelText("API key")).toHaveValue("unsaved-key");
  expect(
    screen.getByRole("button", { name: "Provider connections" }),
  ).toHaveAttribute("aria-current", "location");
  expect(mocks.saveProvider).not.toHaveBeenCalled();
});
it("opens AI from another settings page and tracks manual scrolling", async () => {
  const user = setup();
  await user.click(screen.getByRole("button", { name: "Settings" }));
  await user.click(screen.getByRole("button", { name: "Appearance" }));
  await user.click(screen.getByRole("button", { name: "Quory model" }));
  expect(screen.getByLabelText("Quory model")).toBeVisible();
  expect(screen.getByRole("button", { name: "Quory model" })).toHaveAttribute(
    "aria-current",
    "location",
  );
  const container = screen.getByRole("heading", {
    name: "AI",
    level: 2,
  }).parentElement!;
  for (const [id, top] of [
    ["ai-providers", -400],
    ["ai-assistant", -10],
    ["ai-decision", 300],
  ] as const) {
    vi.spyOn(
      document.getElementById(id)!,
      "getBoundingClientRect",
    ).mockReturnValue({ top } as DOMRect);
  }
  fireEvent.scroll(container);
  expect(screen.getByRole("button", { name: "Quory model" })).toHaveAttribute(
    "aria-current",
    "location",
  );
  expect(
    screen.getByRole("button", { name: "Provider connections" }),
  ).not.toHaveAttribute("aria-current");
});

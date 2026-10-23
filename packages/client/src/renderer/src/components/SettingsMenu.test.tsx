import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { SettingsMenu } from "./SettingsMenu";
import { SettingsContext } from "./SettingsProvider";
import { defaultPreferences } from "../../../shared/settings";
import type { ComponentProps } from "react";

const mocks = vi.hoisted(() => ({
  saveAI: vi.fn(),
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
beforeEach(() => {
  vi.clearAllMocks();
  mocks.saveAI.mockImplementation(async (input) => ({
    provider: input.provider,
    model: input.model,
    baseURL: input.baseURL,
    hasSavedKey: input.provider !== "custom" || !!input.apiKey,
    hasEnvironmentKey: false,
    profiles: {
      ...profiles(),
      [input.provider]: {
        model: input.model,
        baseURL: input.baseURL,
        hasSavedKey: input.provider !== "custom" || !!input.apiKey,
        hasEnvironmentKey: false,
      },
    },
  }));
  mocks.remove.mockResolvedValue({
    provider: "openai",
    model: "test-model",
    hasSavedKey: false,
    hasEnvironmentKey: false,
    profiles: profiles(),
  });
  mocks.models.mockResolvedValue({
    models: [
      { id: "test-model", name: "Test model" },
      { id: "second-model", name: "Second model" },
    ],
    source: "provider",
  });
  mocks.refresh.mockResolvedValue({});
  mocks.preferences.mockResolvedValue({});
  mocks.test.mockResolvedValue({
    success: true,
    message: "Connection successful.",
  });
});
function profiles() {
  return {
    openai: {
      model: "test-model",
      hasSavedKey: true,
      hasEnvironmentKey: false,
    },
    anthropic: {
      model: "saved-claude",
      hasSavedKey: true,
      hasEnvironmentKey: false,
    },
    google: {
      model: "saved-gemini",
      hasSavedKey: true,
      hasEnvironmentKey: false,
    },
    custom: { model: "", hasSavedKey: false, hasEnvironmentKey: false },
  };
}
function setup(secureStorageAvailable = true, hasEnvironmentKey = false) {
  const data = {
    preferences: defaultPreferences,
    ai: {
      provider: "openai",
      model: "test-model",
      hasSavedKey: true,
      hasEnvironmentKey,
      profiles: profiles(),
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
  setup();
  fireEvent.keyDown(window, { key: ",", metaKey: true });
  expect(await screen.findByRole("dialog")).toBeVisible();
  expect(screen.getByRole("dialog").style.transformOrigin).toBe("center");
  expect(screen.getByLabelText("API key")).toHaveValue("");
  expect(screen.getByRole("button", { name: "Test connection" })).toBeEnabled();
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
  await user.type(screen.getByLabelText("API key"), "replacement-key");
  expect(
    screen.getByRole("button", { name: "Test connection" }),
  ).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Save and use OpenAI" }));
  await waitFor(() =>
    expect(mocks.saveAI).toHaveBeenCalledWith({
      provider: "openai",
      model: "test-model",
      apiKey: "replacement-key",
    }),
  );
  await waitFor(() => expect(screen.getByLabelText("API key")).toHaveValue(""));
  expect(mocks.refresh).toHaveBeenCalled();
});
it("prevents saving keys without secure storage and allows removing a saved key", async () => {
  const user = setup(false);
  await user.click(screen.getByRole("button", { name: "Settings" }));
  await user.type(screen.getByLabelText("API key"), "new-key");
  expect(
    screen.getByRole("button", { name: "Save and use OpenAI" }),
  ).toBeDisabled();
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
it("loads live model options and restores each provider's saved model and key status", async () => {
  const user = setup();
  await user.click(screen.getByRole("button", { name: "Settings" }));
  expect(
    await screen.findByRole("option", { name: "Second model — second-model" }),
  ).toBeVisible();
  await user.selectOptions(screen.getByLabelText("Provider"), "anthropic");
  expect(screen.getByLabelText("Model")).toHaveValue("saved-claude");
  expect(screen.getByLabelText("API key")).toHaveValue("");
  expect(screen.getByLabelText("API key")).toHaveAttribute(
    "placeholder",
    "Key saved securely · enter a replacement",
  );
  await user.click(
    screen.getByRole("button", { name: "Save and use Anthropic" }),
  );
  await waitFor(() =>
    expect(mocks.saveAI).toHaveBeenCalledWith({
      provider: "anthropic",
      model: "saved-claude",
    }),
  );
  await waitFor(() => expect(screen.queryByText("Working…")).toBeNull());
  await user.selectOptions(screen.getByLabelText("Provider"), "openai");
  expect(screen.getByLabelText("Model")).toHaveValue("test-model");
  expect(screen.getByLabelText("API key")).toHaveAttribute(
    "placeholder",
    "Key saved securely · enter a replacement",
  );
});
it("keeps manual model entry available when model discovery fails", async () => {
  mocks.models.mockRejectedValue(new Error("unavailable"));
  const user = setup();
  await user.click(screen.getByRole("button", { name: "Settings" }));
  expect(await screen.findByText(/Could not load models/)).toBeVisible();
  await user.selectOptions(screen.getByLabelText("Model"), "__manual__");
  await user.clear(screen.getByLabelText("Manual model ID"));
  await user.type(screen.getByLabelText("Manual model ID"), "my-custom-model");
  await user.click(screen.getByRole("button", { name: "Save and use OpenAI" }));
  await waitFor(() =>
    expect(mocks.saveAI).toHaveBeenCalledWith({
      provider: "openai",
      model: "my-custom-model",
    }),
  );
});
it("configures a custom endpoint with an optional key and manual model", async () => {
  const user = setup();
  await user.click(screen.getByRole("button", { name: "Settings" }));
  await user.selectOptions(screen.getByLabelText("Provider"), "custom");
  await user.type(
    screen.getByLabelText("API base URL"),
    "http://localhost:1234/v1/",
  );
  await user.selectOptions(screen.getByLabelText("Model"), "__manual__");
  await user.type(
    screen.getByLabelText("Manual model ID"),
    "local/model:latest",
  );
  await user.click(
    screen.getByRole("button", { name: "Save and use custom endpoint" }),
  );
  await waitFor(() =>
    expect(mocks.saveAI).toHaveBeenCalledWith({
      provider: "custom",
      baseURL: "http://localhost:1234/v1",
      model: "local/model:latest",
    }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Test connection" }),
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
    expect(mocks.models).toHaveBeenCalledWith({ provider: "openai" }),
  );
  await user.selectOptions(screen.getByLabelText("Provider"), "anthropic");
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
  expect(screen.getByLabelText("Model")).toHaveValue("saved-claude");
});

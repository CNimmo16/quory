import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  app: { isPackaged: false, getVersion: () => "1.2.3" },
  shutdown: vi.fn().mockResolvedValue(undefined),
  PostHog: vi.fn(),
}));
vi.mock("electron", () => ({ app: mocks.app }));
vi.mock("posthog-node", () => ({ PostHog: mocks.PostHog }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.PostHog.mockImplementation(() => ({ shutdown: mocks.shutdown }));
});

describe("main process telemetry", () => {
  it("does not initialize in development", async () => {
    mocks.app.isPackaged = false;
    const { shutdownTelemetry } = await import("./telemetry");
    await shutdownTelemetry();
    expect(mocks.PostHog).not.toHaveBeenCalled();
  });

  it("captures packaged exceptions and flushes with a bounded shutdown", async () => {
    mocks.app.isPackaged = true;
    const { shutdownTelemetry } = await import("./telemetry");
    const config = mocks.PostHog.mock.calls[0]![1];
    expect(config).toMatchObject({
      host: "https://eu.i.posthog.com",
      enableExceptionAutocapture: true,
    });
    expect(config.before_send(null)).toBeNull();
    expect(
      config.before_send({
        event: "$exception",
        properties: { original: true },
      }),
    ).toMatchObject({
      event: "$exception",
      properties: {
        original: true,
        app_version: "1.2.3",
        runtime: "main",
        $process_person_profile: false,
      },
    });
    await shutdownTelemetry();
    expect(mocks.shutdown).toHaveBeenCalledWith(2000);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PostHogConfig } from "posthog-js";

const sdk = vi.hoisted(() => ({
  init: vi.fn(),
  captureException: vi.fn(),
  set_config: vi.fn(),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
  startSessionRecording: vi.fn(),
  stopSessionRecording: vi.fn(),
}));
vi.mock("posthog-js/dist/posthog-recorder", () => ({}));
vi.mock("posthog-js/dist/exception-autocapture", () => ({}));
vi.mock("posthog-js/dist/module.no-external", () => ({ default: sdk }));

let telemetry: typeof import("./telemetry");
const initializeTelemetry = (
  ...args: Parameters<typeof telemetry.initializeTelemetry>
) => telemetry.initializeTelemetry(...args);
const captureRendererException = (error: unknown) =>
  telemetry.captureRendererException(error);

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  telemetry = await import("./telemetry");
});
afterEach(() => vi.unstubAllEnvs());

describe("renderer telemetry", () => {
  it("respects independent privacy choices immediately and sends nothing when both are off", () => {
    vi.stubEnv("PROD", true);
    initializeTelemetry({ analytics: false, errors: false });
    expect(sdk.init).not.toHaveBeenCalled();
    initializeTelemetry({ analytics: false, errors: true });
    const config = sdk.init.mock.calls[0]![1] as PostHogConfig;
    expect(config.opt_out_capturing_by_default).toBe(false);
    if (typeof config.before_send !== "function")
      throw new Error("Expected a send filter");
    const event = { uuid: "test-event", event: "$exception", properties: {} };
    expect(config.before_send?.(event)).toEqual(event);
    expect(config.before_send?.({ ...event, event: "$snapshot" })).toBeNull();
    expect(config.disable_session_recording).toBe(true);
    captureRendererException(new Error("failure"));
    expect(sdk.captureException).toHaveBeenCalledTimes(1);
    initializeTelemetry({ analytics: true, errors: false });
    expect(config.before_send?.(event)).toBeNull();
    expect(
      config.before_send?.({ ...event, event: "$snapshot" }),
    ).not.toBeNull();
    expect(sdk.startSessionRecording).toHaveBeenCalled();
    initializeTelemetry({ analytics: false, errors: false });
    expect(sdk.opt_out_capturing).toHaveBeenCalled();
    expect(sdk.stopSessionRecording).toHaveBeenCalled();
    captureRendererException(new Error("disabled"));
    expect(sdk.captureException).toHaveBeenCalledTimes(1);
  });
  it("does not initialize or send exceptions during development", () => {
    vi.stubEnv("PROD", false);
    initializeTelemetry();
    captureRendererException(new Error("development error"));
    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.captureException).not.toHaveBeenCalled();
  });

  it("uses EU ingestion with masked replay and no analytics or console capture", () => {
    vi.stubEnv("PROD", true);
    initializeTelemetry();
    const config = sdk.init.mock.calls[0]![1] as PostHogConfig;
    expect(config).toMatchObject({
      api_host: "https://eu.i.posthog.com",
      persistence: "localStorage",
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      enable_recording_console_log: false,
      capture_exceptions: {
        capture_unhandled_errors: true,
        capture_unhandled_rejections: true,
        capture_console_errors: false,
      },
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: "*",
        recordBody: false,
        recordHeaders: false,
      },
    });
    const recording = config.session_recording!;
    expect(recording.maskAttributeFn?.("title", "customer@example.com")).toBe(
      "[redacted]",
    );
    expect(recording.maskAttributeFn?.("class", "flex")).toBe("flex");
    expect(
      recording.maskCapturedNetworkRequestFn?.({
        name: "file:///Users/alice/Quory/index.html#/queries/private?token=secret",
        duration: 0,
        entryType: "navigation",
        startTime: 0,
      }),
    ).toMatchObject({ name: "quory://app" });
    const error = new Error("render failed");
    captureRendererException(error);
    expect(sdk.captureException).toHaveBeenCalledWith(error);
  });
});

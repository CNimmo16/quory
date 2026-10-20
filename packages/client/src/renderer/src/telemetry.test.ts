import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PostHogConfig } from "posthog-js";

const sdk = vi.hoisted(() => ({ init: vi.fn(), captureException: vi.fn() }));
vi.mock("posthog-js/dist/posthog-recorder", () => ({}));
vi.mock("posthog-js/dist/exception-autocapture", () => ({}));
vi.mock("posthog-js/dist/module.no-external", () => ({ default: sdk }));

import { initializeTelemetry, captureRendererException } from "./telemetry";

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllEnvs());

describe("renderer telemetry", () => {
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

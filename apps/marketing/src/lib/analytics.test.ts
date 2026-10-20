import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PostHogConfig } from "posthog-js";

const sdk = vi.hoisted(() => ({
  init: vi.fn(),
  capture: vi.fn(),
  register: vi.fn(),
}));
vi.mock("posthog-js", () => ({ default: sdk }));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("PROD", true);
  vi.stubGlobal("window", { location: { hostname: "usequory.com" } });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("marketing analytics", () => {
  it.each(["localhost", "127.0.0.1", "[::1]"])(
    "does not send local preview data from %s",
    async (hostname) => {
      vi.stubGlobal("window", { location: { hostname } });
      const analytics = await import("./analytics");
      analytics.getAnalytics();
      analytics.trackWaitlistSubmitted("cloud");
      expect(sdk.init).not.toHaveBeenCalled();
      expect(sdk.capture).not.toHaveBeenCalled();
    },
  );

  it("initializes once and removes query tokens from event and replay URLs", async () => {
    const { getAnalytics } = await import("./analytics");
    getAnalytics();
    getAnalytics();
    expect(sdk.init).toHaveBeenCalledTimes(1);
    const config = sdk.init.mock.calls[0]![1] as PostHogConfig;
    expect(config.api_host).toBe("https://eu.i.posthog.com");
    expect(config.session_recording).toMatchObject({
      maskAllInputs: true,
      recordBody: false,
      recordHeaders: false,
    });
    const beforeSend = config.before_send as (event: unknown) => any;
    const result = beforeSend({
      event: "$pageview",
      properties: {
        $current_url: "https://usequory.com/confirm/?token=secret#private",
        $referrer: "https://example.com/?email=private",
      },
    });
    expect(result.properties).toMatchObject({
      app: "quory-marketing",
      $current_url: "https://usequory.com/confirm/",
      $referrer: "https://example.com/",
    });
    expect(
      config.session_recording!.maskCapturedNetworkRequestFn!({
        name: "https://usequory.com/confirm/?token=secret",
        duration: 0,
        entryType: "navigation",
        startTime: 0,
      })?.name,
    ).toBe("https://usequory.com/confirm/");
  });

  it("records download and accepted waitlist events without collecting emails", async () => {
    const analytics = await import("./analytics");
    analytics.trackDownloadStarted("macos-arm64-dmg", "1.0.8", "automatic");
    analytics.trackWaitlistSubmitted("download");
    expect(sdk.capture.mock.calls).toEqual([
      [
        "marketing_download_started",
        {
          installer_id: "macos-arm64-dmg",
          version: "1.0.8",
          trigger: "automatic",
        },
        { send_instantly: true },
      ],
      [
        "marketing_waitlist_submitted",
        { source: "download" },
        { send_instantly: true },
      ],
    ]);
  });

  it("does not let an analytics failure interrupt a conversion", async () => {
    sdk.capture.mockImplementationOnce(() => {
      throw new Error("SDK unavailable");
    });
    const { trackWaitlistSubmitted } = await import("./analytics");
    expect(() => trackWaitlistSubmitted("cloud")).not.toThrow();
  });
});

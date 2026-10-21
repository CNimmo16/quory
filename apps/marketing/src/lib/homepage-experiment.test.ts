// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOMEPAGE_COPY_FLAG, homepageCopy } from "./homepage-copy";
import { initializeHomepageExperiment } from "./homepage-experiment";
import homepageReveal from "./homepage-reveal.js?raw";

const mocks = vi.hoisted(() => ({
  local: vi.fn(() => false),
  getFeatureFlag: vi.fn(),
  onFeatureFlags: vi.fn(),
  reloadFeatureFlags: vi.fn(),
}));
vi.mock("./analytics", () => ({
  isLocalPreview: mocks.local,
  getAnalytics: () => mocks,
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubEnv("DEV", false);
  mocks.local.mockReturnValue(false);
  document.body.innerHTML = `<h1><span data-copy-eyebrow>${homepageCopy.control.eyebrow}</span><span data-copy-headline>${homepageCopy.control.headline}</span></h1><p data-copy-description>Diagnose customer issues directly in your database - <i>fast</i>.</p>`;
  // Run the same standalone script that Astro inlines before the hero.
  new Function(homepageReveal)();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

function deliverFlag(value: unknown, errorsLoading = false) {
  mocks.getFeatureFlag.mockReturnValue(value);
  mocks.onFeatureFlags.mock.calls[0]![0]([], {}, { errorsLoading });
}

describe("homepage copy assignment", () => {
  it("requests a flag result even when the project has no active flags", () => {
    initializeHomepageExperiment();
    expect(mocks.reloadFeatureFlags).toHaveBeenCalledOnce();
    deliverFlag(undefined);
    expect(document.documentElement.dataset.homepageCopy).toBe("ready");
    expect(mocks.getFeatureFlag.mock.calls).toEqual([
      [HOMEPAGE_COPY_FLAG, { send_event: false }],
    ]);
  });

  it.each(Object.keys(homepageCopy))(
    "renders %s before recording its exposure",
    (variant) => {
      initializeHomepageExperiment();
      deliverFlag(variant);
      expect(document.querySelector("[data-copy-headline]")?.textContent).toBe(
        homepageCopy[variant as keyof typeof homepageCopy].headline,
      );
      expect(mocks.getFeatureFlag.mock.calls).toEqual([
        [HOMEPAGE_COPY_FLAG, { send_event: false }],
        [HOMEPAGE_COPY_FLAG],
      ]);
      expect(document.documentElement.dataset.homepageCopy).toBe("ready");
      deliverFlag(variant === "support" ? "skip-the-joins" : "support");
      expect(mocks.getFeatureFlag).toHaveBeenCalledTimes(2);
      expect(document.querySelector("[data-copy-headline]")?.textContent).toBe(
        homepageCopy[variant as keyof typeof homepageCopy].headline,
      );
    },
  );

  it.each([undefined, false, true, "unknown", "__proto__"])(
    "keeps control without exposure for %s",
    (value) => {
      initializeHomepageExperiment();
      deliverFlag(value);
      expect(
        document.querySelector("[data-copy-description] i")?.textContent,
      ).toBe("fast");
      expect(mocks.getFeatureFlag).toHaveBeenCalledTimes(1);
    },
  );

  it("reveals control within 500 ms even if the SDK never loads", () => {
    vi.advanceTimersByTime(499);
    expect(document.documentElement.dataset.homepageCopy).toBe("pending");
    vi.advanceTimersByTime(1);
    expect(document.documentElement.dataset.homepageCopy).toBe("ready");
    expect(document.querySelector("[data-copy-headline]")?.textContent).toBe(
      homepageCopy.control.headline,
    );
  });

  it("never changes visible copy or records exposure for a late assignment", () => {
    initializeHomepageExperiment();
    vi.advanceTimersByTime(500);
    deliverFlag("support");
    expect(document.querySelector("[data-copy-headline]")?.textContent).toBe(
      homepageCopy.control.headline,
    );
    expect(mocks.getFeatureFlag).not.toHaveBeenCalled();
    expect(document.documentElement.dataset.homepageCopy).toBe("ready");
  });

  it("enforces the deadline even when a busy main thread delays the fallback timer", () => {
    initializeHomepageExperiment();
    vi.setSystemTime(Date.now() + 600);
    deliverFlag("support");
    expect(mocks.getFeatureFlag).not.toHaveBeenCalled();
    expect(document.documentElement.dataset.homepageCopy).toBe("ready");
    expect(document.querySelector("[data-copy-headline]")?.textContent).toBe(
      homepageCopy.control.headline,
    );
  });

  it("allows a cached assignment immediately without waiting for the deadline", () => {
    mocks.getFeatureFlag.mockReturnValue("support");
    mocks.onFeatureFlags.mockImplementationOnce((callback) =>
      callback([], {}, {}),
    );
    initializeHomepageExperiment();
    expect(document.documentElement.dataset.homepageCopy).toBe("ready");
    expect(mocks.reloadFeatureFlags).not.toHaveBeenCalled();
    expect(document.querySelector("[data-copy-headline]")?.textContent).toBe(
      homepageCopy.support.headline,
    );
    vi.advanceTimersByTime(500);
    expect(document.querySelector("[data-copy-headline]")?.textContent).toBe(
      homepageCopy.support.headline,
    );
  });

  it("does not trust cached variants when the flag request failed", () => {
    initializeHomepageExperiment();
    deliverFlag("skip-the-joins", true);
    expect(mocks.getFeatureFlag).not.toHaveBeenCalled();
    expect(document.querySelector("[data-copy-headline]")?.textContent).toBe(
      homepageCopy.control.headline,
    );
  });

  it("only enrolls on pages containing the homepage hero", () => {
    document.body.innerHTML = "<h1>Documentation</h1>";
    initializeHomepageExperiment();
    expect(mocks.onFeatureFlags).not.toHaveBeenCalled();
  });

  it("previews locally without enrolling a visitor", () => {
    mocks.local.mockReturnValue(true);
    history.replaceState(null, "", "/?copy_variant=support");
    initializeHomepageExperiment();
    expect(document.querySelector("[data-copy-headline]")?.textContent).toBe(
      homepageCopy.support.headline,
    );
    expect(mocks.onFeatureFlags).not.toHaveBeenCalled();
    history.replaceState(null, "", "/");
  });
});

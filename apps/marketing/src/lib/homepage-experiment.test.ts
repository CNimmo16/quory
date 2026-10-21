// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HOMEPAGE_COPY_FLAG, homepageCopy } from "./homepage-copy";
import { initializeHomepageExperiment } from "./homepage-experiment";

const mocks = vi.hoisted(() => ({
  local: vi.fn(() => false),
  getFeatureFlag: vi.fn(),
  onFeatureFlags: vi.fn(),
}));
vi.mock("./analytics", () => ({
  isLocalPreview: mocks.local,
  getAnalytics: () => mocks,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DEV", false);
  mocks.local.mockReturnValue(false);
  document.documentElement.dataset.homepageCopy = "pending";
  document.body.innerHTML = `<h1><span data-copy-eyebrow>${homepageCopy.control.eyebrow}</span><span data-copy-headline>${homepageCopy.control.headline}</span></h1><p data-copy-description>Diagnose customer issues directly in your database - <i>fast</i>.</p>`;
});

function deliverFlag(value: unknown, errorsLoading = false) {
  mocks.getFeatureFlag.mockReturnValue(value);
  mocks.onFeatureFlags.mock.calls[0]![0]([], {}, { errorsLoading });
}

describe("homepage copy assignment", () => {
  it.each(Object.keys(homepageCopy))(
    "renders %s before recording its exposure",
    (variant) => {
      initializeHomepageExperiment();
      deliverFlag(variant);
      expect(document.querySelector("[data-copy-headline]")?.textContent).toBe(
        homepageCopy[variant as keyof typeof homepageCopy].headline,
      );
      expect(document.documentElement.dataset.homepageCopy).toBe("ready");
      expect(mocks.getFeatureFlag.mock.calls).toEqual([
        [HOMEPAGE_COPY_FLAG, { send_event: false }],
        [HOMEPAGE_COPY_FLAG],
      ]);
      deliverFlag("customer-issues");
      expect(mocks.getFeatureFlag).toHaveBeenCalledTimes(2);
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
      expect(document.documentElement.dataset.homepageCopy).toBe("ready");
    },
  );

  it("does not change copy or log exposure when flags arrive after the fallback deadline", () => {
    initializeHomepageExperiment();
    document.documentElement.dataset.homepageCopy = "ready";
    deliverFlag("skip-the-joins");
    expect(mocks.getFeatureFlag).not.toHaveBeenCalled();
    expect(document.querySelector("[data-copy-headline]")?.textContent).toBe(
      homepageCopy.control.headline,
    );
  });

  it("does not trust cached variants when the flag request failed", () => {
    initializeHomepageExperiment();
    deliverFlag("skip-the-joins", true);
    expect(mocks.getFeatureFlag).not.toHaveBeenCalled();
    expect(document.documentElement.dataset.homepageCopy).toBe("ready");
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

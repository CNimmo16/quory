// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fallbackManifest, loadManifest } from "./downloads";
import { initializeInstallerDownload } from "./installer-download";
import { trackDownloadStarted, trackCloudSignupViewed } from "./analytics";

vi.mock("./analytics", () => ({
  trackDownloadStarted: vi.fn(),
  trackCloudSignupViewed: vi.fn(),
}));
vi.mock("./downloads", async (original) => ({
  ...(await original<typeof import("./downloads")>()),
  loadManifest: vi.fn(),
}));

const assign = vi.fn();
const replaceState = vi.fn();
const installerId = "macos-arm64-dmg";
const asset = fallbackManifest.assets.find(
  (asset) => asset.id === installerId,
)!;

function visit(query = "") {
  vi.stubGlobal("window", {
    location: {
      href: `https://usequory.com/downloads/install/${installerId}/${query}`,
      assign,
    },
  });
}

function clickDownload() {
  const link = document.querySelector<HTMLAnchorElement>("a")!;
  // Prevent jsdom navigation after the production click handler runs.
  link.addEventListener("click", (event) => event.preventDefault(), {
    once: true,
  });
  link.click();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  visit();
  vi.stubGlobal("history", { state: null, replaceState });
  vi.mocked(loadManifest).mockResolvedValue(fallbackManifest);
  document.body.innerHTML = `
    <section data-installer="${installerId}">
      <p data-download-status></p>
      <a data-installer-link href="${asset.url}">Download installer</a>
      <p data-installer-version></p>
    </section>
    <dialog data-download-cloud></dialog>`;
  const popup = document.querySelector<HTMLDialogElement>(
    "[data-download-cloud]",
  )!;
  popup.showModal = vi.fn(() => popup.setAttribute("open", ""));
  popup.close = vi.fn(() => popup.removeAttribute("open"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("installation download and optional cloud signup", () => {
  it("starts the automatic download immediately and waits 800 ms before opening the cloud popup", async () => {
    visit("?start=1");
    assign.mockImplementationOnce(() => {
      expect(
        document.querySelector<HTMLDialogElement>("[data-download-cloud]")!
          .open,
      ).toBe(false);
    });
    await initializeInstallerDownload();
    expect(assign).toHaveBeenCalledWith(asset.url);
    await vi.advanceTimersByTimeAsync(799);
    expect(trackCloudSignupViewed).not.toHaveBeenCalled();
    expect(
      document.querySelector<HTMLDialogElement>("[data-download-cloud]")!.open,
    ).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(trackCloudSignupViewed).toHaveBeenCalledWith({
      source: "download",
      installerId,
    });
    expect(
      document.querySelector<HTMLDialogElement>("[data-download-cloud]")!.open,
    ).toBe(true);
    expect(trackDownloadStarted).toHaveBeenCalledWith(
      installerId,
      fallbackManifest.version,
      "automatic",
    );
    expect(
      new URL(replaceState.mock.calls[0]![2]).searchParams.has("start"),
    ).toBe(false);
  });

  it("keeps the popup closed on a direct visit until a manual download", async () => {
    await initializeInstallerDownload();
    expect(assign).not.toHaveBeenCalled();
    expect(
      document.querySelector<HTMLDialogElement>("[data-download-cloud]")!.open,
    ).toBe(false);
    clickDownload();
    await vi.runAllTimersAsync();
    expect(
      document.querySelector<HTMLDialogElement>("[data-download-cloud]")!.open,
    ).toBe(true);
    expect(trackDownloadStarted).toHaveBeenCalledWith(
      installerId,
      fallbackManifest.version,
      "manual",
    );
    expect(
      document.querySelector("[data-download-status]")!.textContent,
    ).toContain("should start shortly");
  });

  it("does not offer post-download signup when the installer is unavailable", async () => {
    visit("?start=1");
    vi.mocked(loadManifest).mockResolvedValue({
      ...fallbackManifest,
      assets: [],
    });
    await initializeInstallerDownload();
    expect(assign).not.toHaveBeenCalled();
    expect(trackDownloadStarted).not.toHaveBeenCalled();
    expect(trackCloudSignupViewed).not.toHaveBeenCalled();
    expect(
      document.querySelector<HTMLDialogElement>("[data-download-cloud]")!.open,
    ).toBe(false);
    expect(document.querySelector("a")!.hasAttribute("href")).toBe(false);
  });

  it("does not automatically download again if a manual download starts while the manifest loads", async () => {
    visit("?start=1");
    let resolveManifest!: (manifest: typeof fallbackManifest) => void;
    vi.mocked(loadManifest).mockReturnValue(
      new Promise((resolve) => {
        resolveManifest = resolve;
      }),
    );
    const ready = initializeInstallerDownload();
    clickDownload();
    resolveManifest(fallbackManifest);
    await ready;
    await vi.runAllTimersAsync();
    expect(assign).not.toHaveBeenCalled();
    expect(trackDownloadStarted).toHaveBeenCalledTimes(1);
    expect(
      document.querySelector<HTMLDialogElement>("[data-download-cloud]")!.open,
    ).toBe(true);
  });

  it("does not reopen a dismissed popup when retrying the download", async () => {
    await initializeInstallerDownload();
    clickDownload();
    await vi.runAllTimersAsync();
    const popup = document.querySelector<HTMLDialogElement>(
      "[data-download-cloud]",
    )!;
    expect(popup.open).toBe(true);
    popup.close();
    clickDownload();
    await vi.runAllTimersAsync();
    expect(popup.open).toBe(false);
    expect(popup.showModal).toHaveBeenCalledTimes(1);
    expect(trackCloudSignupViewed).toHaveBeenCalledTimes(1);
    expect(trackDownloadStarted).toHaveBeenCalledTimes(2);
  });
});

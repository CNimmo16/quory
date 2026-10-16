import { afterEach, describe, expect, it, vi } from "vitest";
import {
  detectDevice,
  fallbackManifest,
  parseManifest,
  recommendedAsset,
  newerOrEqual,
  installerPageURL,
} from "./downloads";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
describe("device detection and safe installer selection", () => {
  it("detects Windows and Linux x64 and selects direct installer links", () => {
    for (const [ua, platform, id] of [
      ["Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Win32", "windows-x64-exe"],
      ["Mozilla/5.0 (X11; Linux x86_64)", "Linux x86_64", "linux-x64-appimage"],
    ]) {
      expect(
        recommendedAsset(fallbackManifest, detectDevice(ua, platform))?.id,
      ).toBe(id);
    }
  });
  it("never assumes a Mac claiming Intel actually has an Intel chip", () => {
    const device = detectDevice(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      "MacIntel",
    );
    expect(device).toEqual({ os: "macos", arch: null });
    expect(recommendedAsset(fallbackManifest, device)).toBeUndefined();
  });
  it("uses high entropy architecture hints when provided", () => {
    const device = detectDevice(
      "Macintosh; Intel Mac OS X",
      "MacIntel",
      0,
      "arm",
      "64",
    );
    expect(recommendedAsset(fallbackManifest, device)?.id).toBe(
      "macos-arm64-dmg",
    );
  });
  it("does not advertise x64 packages to ARM Linux or Windows", () => {
    for (const ua of ["Windows NT 10.0; ARM64", "X11; Linux aarch64"])
      expect(
        recommendedAsset(fallbackManifest, detectDevice(ua)),
      ).toBeUndefined();
  });
  it("routes iOS, iPad desktop mode, Android, ChromeOS and unknown clients to the chooser", () => {
    for (const [ua, platform, touches] of [
      ["iPhone", "iPhone", 1],
      ["Macintosh", "MacIntel", 5],
      ["Linux; Android 14", "Linux", 1],
      ["X11; CrOS x86_64", "Linux", 0],
      ["", "", 0],
    ] as const)
      expect(detectDevice(ua, platform, touches).os).toBeNull();
  });
});
describe("manifest integrity", () => {
  it("accepts the verified bootstrap release", () =>
    expect(parseManifest(fallbackManifest).version).toBe("1.0.6"));
  it("rejects alternate hosts, releases, duplicate IDs, empty sizes and invalid checksums", () => {
    for (const change of [
      (m: any) =>
        (m.assets[0].url = m.assets[0].url.replace(
          "github.com",
          "example.com",
        )),
      (m: any) => (m.assets[0].url = m.assets[0].url.replace("1.0.6", "1.0.5")),
      (m: any) => m.assets.push(m.assets[0]),
      (m: any) => (m.assets[0].size = 0),
      (m: any) => (m.assets[0].sha256 = "bad"),
    ]) {
      const m = structuredClone(fallbackManifest);
      change(m);
      expect(() => parseManifest(m)).toThrow();
    }
  });
  it("compares versions numerically", () => {
    expect(newerOrEqual("1.0.10", "1.0.9")).toBe(true);
    expect(newerOrEqual("1.0.5", "1.0.6")).toBe(false);
  });
  it("retains verified downloads when the live manifest is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const { loadManifest } = await import("./downloads");
    expect((await loadManifest()).version).toBe("1.0.6");
  });
  it("rejects a live manifest pointing at an untrusted host", async () => {
    const bad = structuredClone(fallbackManifest);
    bad.assets[0].url = "https://example.com/malware.exe";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => bad }),
    );
    const { loadManifest } = await import("./downloads");
    expect((await loadManifest()).assets[0].url).toBe(
      fallbackManifest.assets[0].url,
    );
  });
});

it("routes known installers to instructions with one download request", () => {
  expect(installerPageURL("windows-x64-exe")).toBe(
    "/downloads/install/windows-x64-exe/?start=1",
  );
  expect(() => installerPageURL("https://example.com/app.exe")).toThrow(
    "Unknown installer",
  );
});

import bundled from "../data/downloads.json";
import targets from "../data/download-targets.json";

export { targets };
export type OS = "macos" | "windows" | "linux";
export type Device = { os: OS | null; arch: "arm64" | "x64" | null };
export type Asset = {
  id: string;
  filename: string;
  url: string;
  size: number;
  sha256: string | null;
};
export type Manifest = {
  schemaVersion: 1;
  version: string;
  publishedAt: string;
  assets: Asset[];
};
export const osNames = { macos: "macOS", windows: "Windows", linux: "Linux" };
export const manifestURL =
  "https://raw.githubusercontent.com/CNimmo16/quory/download-manifest/latest.json";

// Only accept known installer types from this repository's exact desktop release.
export function parseManifest(value: unknown): Manifest {
  const m = value as Manifest;
  if (
    !m ||
    m.schemaVersion !== 1 ||
    !/^\d+\.\d+\.\d+$/.test(m.version) ||
    !Number.isFinite(Date.parse(m.publishedAt)) ||
    !Array.isArray(m.assets) ||
    !m.assets.length
  )
    throw new Error("Invalid download manifest");
  const ids = new Set<string>();
  for (const a of m.assets) {
    const target = targets.find((t) => t.id === a.id);
    if (
      !target ||
      ids.has(a.id) ||
      !Number.isSafeInteger(a.size) ||
      a.size <= 0 ||
      !/^quory-[\w.-]+$/.test(a.filename) ||
      !a.filename.endsWith(`.${target.format}`) ||
      (a.sha256 !== null && !/^[a-f0-9]{64}$/.test(a.sha256))
    )
      throw new Error("Invalid download asset");
    const url = new URL(a.url);
    const expected = `/CNimmo16/quory/releases/download/@quory/client@${m.version}/${a.filename}`;
    if (
      url.origin !== "https://github.com" ||
      decodeURIComponent(url.pathname) !== expected ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    )
      throw new Error("Unexpected download URL");
    ids.add(a.id);
  }
  return m;
}
export const fallbackManifest = parseManifest(bundled);
export function newerOrEqual(a: string, b: string) {
  const x = a.split(".").map(Number),
    y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return x[i] > y[i];
  }
  return true;
}
let manifestPromise: Promise<Manifest> | undefined;
export function loadManifest(): Promise<Manifest> {
  return (manifestPromise ??= fetch(manifestURL, {
    signal: AbortSignal.timeout(5000),
    credentials: "omit",
  })
    .then(async (response) => {
      if (!response.ok) throw new Error("Manifest unavailable");
      const manifest = parseManifest(await response.json());
      return newerOrEqual(manifest.version, fallbackManifest.version)
        ? manifest
        : fallbackManifest;
    })
    .catch(() => fallbackManifest));
}
export function detectDevice(
  ua: string,
  platform = "",
  touches = 0,
  architecture = "",
  bitness = "",
): Device {
  if (
    /Android|iPhone|iPad|iPod|Mobile/i.test(ua) ||
    (/Mac/i.test(`${platform} ${ua}`) && touches > 1)
  )
    return { os: null, arch: null };
  const source = `${platform} ${ua}`;
  const os = /Mac/i.test(source)
    ? "macos"
    : /Win/i.test(source)
      ? "windows"
      : /Linux|X11/i.test(source) && !/CrOS/i.test(source)
        ? "linux"
        : null;
  let arch: Device["arch"] = null;
  if (/arm64|aarch64/i.test(ua) || (architecture === "arm" && bitness === "64"))
    arch = "arm64";
  else if (architecture === "x86" && bitness === "64") arch = "x64";
  // macOS user agents often claim Intel even on Apple Silicon.
  else if (os !== "macos" && /x86_64|x64|Win64|WOW64|amd64/i.test(ua))
    arch = "x64";
  return { os, arch };
}
export async function browserDevice(): Promise<Device> {
  const basic = detectDevice(navigator.userAgent, "", navigator.maxTouchPoints);
  const nav = navigator as Navigator & {
    userAgentData?: {
      getHighEntropyValues: (
        hints: string[],
      ) => Promise<{ architecture?: string; bitness?: string }>;
    };
  };
  if (!nav.userAgentData || !basic.os) return basic;
  try {
    const hints = await Promise.race([
      nav.userAgentData.getHighEntropyValues(["architecture", "bitness"]),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Hints unavailable")), 500),
      ),
    ]);
    return detectDevice(
      navigator.userAgent,
      "",
      navigator.maxTouchPoints,
      hints.architecture,
      hints.bitness,
    );
  } catch {
    return basic;
  }
}
export function recommendedAsset(manifest: Manifest, device: Device) {
  const target = targets.find(
    (t) => t.os === device.os && t.arch === device.arch,
  );
  return target ? manifest.assets.find((a) => a.id === target.id) : undefined;
}
export function fileSize(bytes: number) {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

export function installerPageURL(id: string) {
  if (!targets.some((target) => target.id === id))
    throw new Error("Unknown installer");
  return `/downloads/install/${id}/?start=1`;
}

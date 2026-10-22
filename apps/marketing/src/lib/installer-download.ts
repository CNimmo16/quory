import { trackDownloadStarted, trackCloudSignupViewed } from "./analytics";
import { fallbackManifest, loadManifest } from "./downloads";

export function initializeInstallerDownload() {
  const page = document.querySelector<HTMLElement>("[data-installer]");
  if (!page) return;
  const installerId = page.dataset.installer!;
  const link = page.querySelector<HTMLAnchorElement>("[data-installer-link]")!;
  const status = page.querySelector<HTMLElement>("[data-download-status]")!;
  const cloud = document.querySelector<HTMLDialogElement>(
    "[data-download-cloud]",
  )!;
  const url = new URL(window.location.href);
  const start = url.searchParams.get("start") === "1";
  let currentVersion = fallbackManifest.version;
  let started = false;
  let prompted = false;

  function downloadStarted(trigger: "automatic" | "manual") {
    started = true;
    trackDownloadStarted(installerId, currentVersion, trigger);
    status.textContent =
      "Your download should start shortly. Follow the steps below to install Quory.";
    link.textContent = "Download not starting? Try again";
    if (!prompted) {
      prompted = true;
      // Give the download confirmation a moment to register before the cloud pitch.
      setTimeout(() => {
        cloud.showModal();
        trackCloudSignupViewed({ source: "download", installerId });
      }, 800);
    }
  }

  link.addEventListener("click", (event) => {
    if (!event.defaultPrevented && link.hasAttribute("href") && !link.hidden) {
      downloadStarted("manual");
    }
  });
  // Consume the request before downloading, so refreshing/back won't download again.
  if (start) {
    url.searchParams.delete("start");
    history.replaceState(history.state, "", url);
    status.textContent = "Preparing your download…";
  }
  return loadManifest().then((manifest) => {
    const asset = manifest.assets.find((a) => a.id === installerId);
    link.hidden = !asset;
    if (!asset) {
      link.removeAttribute("href");
      if (!started) {
        status.textContent =
          "This installer is not available yet. Please choose another download.";
      }
      return;
    }
    link.href = asset.url;
    currentVersion = manifest.version;
    page.querySelector("[data-installer-version]")!.textContent =
      `Version ${manifest.version}`;
    if (started) return;
    status.textContent = "Your installer is ready to download.";
    if (start) {
      // GitHub serves an attachment, leaving this instructions page in place.
      window.location.assign(asset.url);
      downloadStarted("automatic");
    }
  });
}

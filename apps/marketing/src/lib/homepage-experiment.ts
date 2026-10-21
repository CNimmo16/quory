import { getAnalytics, isLocalPreview } from "./analytics";
import {
  HOMEPAGE_COPY_FLAG,
  isHomepageCopyVariant,
  renderHomepageCopy,
} from "./homepage-copy";

export function initializeHomepageExperiment() {
  const root = document.documentElement;
  if (!document.querySelector("[data-copy-headline]")) return;

  // Preview every variant locally without polluting experiment results.
  if (isLocalPreview() || import.meta.env.DEV) {
    const variant = new URLSearchParams(window.location.search).get(
      "copy_variant",
    );
    if (isHomepageCopyVariant(variant)) renderHomepageCopy(variant);
    root.dataset.homepageCopy = "ready";
    return;
  }

  const analytics = getAnalytics();
  if (!analytics) {
    root.dataset.homepageCopy = "ready";
    return;
  }
  analytics.onFeatureFlags((_flags, _variants, context) => {
    // Once the text starts fading in, never change it or enroll a late variant.
    if (root.dataset.homepageCopy !== "pending") return;
    const deadline = Number(root.dataset.homepageCopyDeadline);
    if (
      !Number.isFinite(deadline) ||
      Date.now() >= deadline ||
      context?.errorsLoading
    ) {
      root.dataset.homepageCopy = "ready";
      return;
    }
    const variant = analytics.getFeatureFlag(HOMEPAGE_COPY_FLAG, {
      send_event: false,
    });
    if (isHomepageCopyVariant(variant) && renderHomepageCopy(variant)) {
      root.dataset.homepageCopy = "ready";
      // Record PostHog's standard experiment exposure only after rendering it.
      analytics.getFeatureFlag(HOMEPAGE_COPY_FLAG);
      return;
    }
    root.dataset.homepageCopy = "ready";
  });
  // The SDK skips its initial flag request when remote config says there are
  // no flags. Request an explicit result so a draft/disabled test reveals control.
  if (root.dataset.homepageCopy === "pending") analytics.reloadFeatureFlags();
}

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
    // Never switch copy after the timeout or record exposure to unseen variants.
    if (root.dataset.homepageCopy !== "pending") return;
    if (context?.errorsLoading) {
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
}

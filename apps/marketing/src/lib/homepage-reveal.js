// Inlined before the hero so the fallback works even if the SDK never loads.
(() => {
  const root = document.documentElement;
  root.dataset.homepageCopy = "pending";
  root.dataset.homepageCopyDeadline = String(Date.now() + 500);
  setTimeout(() => {
    if (root.dataset.homepageCopy === "pending") {
      root.dataset.homepageCopy = "ready";
    }
  }, 500);
})();

// Run in the head before first paint. Share the docs' preference: empty means system.
window.quoryColourScheme = (() => {
  const key = "starlight-theme";
  const root = document.documentElement;
  const listeners = new Set();
  let preference = "system";
  function readPreference() {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function apply(value) {
    const explicit = value === "dark" || value === "light";
    root.classList.toggle("dark", value === "dark");
    root.classList.toggle("light", value === "light");
    for (const meta of document.querySelectorAll("meta[data-theme-colour]")) {
      const scheme = meta.dataset.themeColour;
      meta.media = explicit
        ? (scheme === value ? "all" : "not all")
        : `(prefers-color-scheme: ${scheme})`;
    }
    preference = explicit ? value : "system";
    for (const listener of listeners) listener();
  }

  apply(readPreference());
  window.addEventListener("storage", (event) => {
    if (event.key === key || event.key === null) apply(readPreference());
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) apply(readPreference());
  });
  return {
    getSnapshot: () => preference,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(value) {
      apply(value);
      try {
        if (value === "system") localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      } catch {
        // The choice still applies to this page when storage is unavailable.
      }
    },
  };
})();

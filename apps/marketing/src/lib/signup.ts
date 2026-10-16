interface Turnstile {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  reset(id: string): void;
  getResponse(id: string): string;
}
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}
let scriptPromise: Promise<Turnstile> | undefined;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) {
    scriptPromise = new Promise<Turnstile>((resolve, reject) => {
      const script = document.createElement("script");
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      const timer = setTimeout(() => {
        script.remove();
        reject(new Error("Verification could not load. Please try again."));
      }, 15000);
      script.onload = () => {
        clearTimeout(timer);
        window.turnstile
          ? resolve(window.turnstile)
          : reject(new Error("Verification is unavailable."));
      };
      script.onerror = () => {
        clearTimeout(timer);
        script.remove();
        reject(new Error("Verification could not load. Please try again."));
      };
      document.head.append(script);
    }).catch((error) => {
      scriptPromise = undefined;
      throw error;
    });
  }
  return scriptPromise;
}

export function signupForm(form: HTMLFormElement) {
  const container = form.querySelector<HTMLElement>("[data-signup-challenge]")!;
  const status = form.querySelector<HTMLElement>("[data-signup-status]")!;
  let widget: string | undefined;
  let preparing: Promise<void> | undefined;
  function message(text: string, error = false) {
    status.textContent = text;
    status.dataset.error = String(error);
  }
  async function prepare() {
    if (!container.dataset.sitekey) {
      message(
        "Email signup isn’t available yet. Please try again later.",
        true,
      );
      return;
    }
    if (preparing) return preparing;
    preparing = (async () => {
      const api = await loadTurnstile();
      if (widget !== undefined) api.reset(widget);
      else
        widget = api.render(container, {
          sitekey: container.dataset.sitekey,
          action: "waitlist",
          size: "flexible",
          "error-callback": () =>
            message("Verification failed. Please try again.", true),
          "expired-callback": () => {
            if (widget !== undefined) api.reset(widget);
          },
        });
    })()
      .catch((error) => message(error.message, true))
      .finally(() => {
        preparing = undefined;
      });
    return preparing;
  }
  async function submit(email: string, source: "download" | "cloud") {
    if (preparing) await preparing;
    const token =
      widget === undefined ? "" : window.turnstile?.getResponse(widget);
    if (!token)
      throw new Error("Please complete the verification before continuing.");
    const response = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, source, turnstileToken: token }),
      signal: AbortSignal.timeout(30000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(
        result.error || "Signup is unavailable. Please try again later.",
      );
    return result.message as string;
  }
  return { prepare, submit, message };
}

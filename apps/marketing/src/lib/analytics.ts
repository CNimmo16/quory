import posthog from "posthog-js";

const POSTHOG_TOKEN = "phc_t72QPEu7Exajzc8bgXMmyLBbhjVNAxBtG8vtC8NqFoHx";
let initialized = false;

export function isLocalPreview() {
  return ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
}

export function withoutQuery(value: string) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "";
  }
}

export function getAnalytics() {
  if (!import.meta.env.PROD || isLocalPreview()) return undefined;
  if (initialized) return posthog;
  initialized = true;
  posthog.init(POSTHOG_TOKEN, {
    api_host: "https://eu.i.posthog.com",
    ui_host: "https://eu.posthog.com",
    persistence: "localStorage+cookie",
    person_profiles: "identified_only",
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: true,
    capture_dead_clicks: false,
    capture_exceptions: {
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    },
    enable_recording_console_log: false,
    session_recording: {
      maskAllInputs: true,
      blockSelector: "[data-signup-challenge]",
      recordHeaders: false,
      recordBody: false,
      maskCapturedNetworkRequestFn: (request) => ({
        ...request,
        name: withoutQuery(request.name),
      }),
    },
    feature_flag_request_timeout_ms: 1000,
    before_send: (event) => {
      if (!event) return null;
      // Confirmation URLs and referrers can contain email verification tokens.
      for (const key of [
        "$current_url",
        "$referrer",
        "$initial_current_url",
        "$initial_referrer",
      ]) {
        const value = event.properties[key];
        if (typeof value === "string")
          event.properties[key] = withoutQuery(value);
      }
      event.properties.app = "quory-marketing";
      return event;
    },
    loaded: (client) => {
      client.register({ app: "quory-marketing" });
      client.capture("$pageview");
    },
  });
  return posthog;
}

export function trackDownloadStarted(
  installerId: string,
  version: string,
  trigger: "automatic" | "manual",
) {
  captureConversion("marketing_download_started", {
    installer_id: installerId,
    version,
    trigger,
  });
}

export function trackWaitlistSubmitted(source: "download" | "cloud") {
  // Never send the email, Turnstile response, or confirmation token to analytics.
  captureConversion("marketing_waitlist_submitted", { source });
}

function captureConversion(event: string, properties: Record<string, string>) {
  try {
    getAnalytics()?.capture(event, properties, { send_instantly: true });
  } catch {
    // Analytics must never interrupt a download or turn an accepted signup into an error.
  }
}

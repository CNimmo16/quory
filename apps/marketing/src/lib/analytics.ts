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

export interface SignupContext {
  source: "download" | "cloud";
  installerId?: string;
}

export type SignupState =
  "not_started" | "started" | "submitting" | "submitted";
export type SignupDismissMethod =
  "close_button" | "continue_to_installation" | "escape" | "backdrop" | "other";
export type SignupFailure =
  | "missing_email"
  | "invalid_email"
  | "verification_required"
  | "rate_limited"
  | "server_error"
  | "rejected"
  | "timeout"
  | "network_error";

function signupProperties(context: SignupContext): Record<string, string> {
  // Explicitly allowlist properties: never capture email, tokens or raw errors.
  const properties: Record<string, string> = {
    source: context.source,
    surface:
      context.source === "download" ? "download_popup" : "homepage_dialog",
    page_path: window.location.pathname,
  };
  if (context.installerId) properties.installer_id = context.installerId;
  return properties;
}

export function trackCloudSignupViewed(context: SignupContext) {
  captureConversion("marketing_cloud_signup_viewed", signupProperties(context));
}

export function trackCloudSignupDismissed(
  context: SignupContext,
  method: SignupDismissMethod,
  state: SignupState,
) {
  captureConversion("marketing_cloud_signup_dismissed", {
    ...signupProperties(context),
    method,
    signup_state: state,
  });
}

export function trackWaitlistStarted(context: SignupContext) {
  captureConversion("marketing_waitlist_started", signupProperties(context));
}

export function trackWaitlistSubmitAttempted(context: SignupContext) {
  captureConversion(
    "marketing_waitlist_submit_attempted",
    signupProperties(context),
  );
}

export function trackWaitlistFailed(
  context: SignupContext,
  reason: SignupFailure,
) {
  captureConversion("marketing_waitlist_failed", {
    ...signupProperties(context),
    reason,
  });
}

export type VerificationFailure =
  "unavailable" | "load_failed" | "challenge_failed";

export function trackWaitlistVerificationFailed(
  context: SignupContext,
  reason: VerificationFailure,
) {
  captureConversion("marketing_waitlist_verification_failed", {
    ...signupProperties(context),
    reason,
  });
}

export function trackWaitlistSubmitted(context: SignupContext) {
  captureConversion("marketing_waitlist_submitted", signupProperties(context));
}

function captureConversion(event: string, properties: Record<string, string>) {
  try {
    getAnalytics()?.capture(event, properties, { send_instantly: true });
  } catch {
    // Analytics must never interrupt a download or turn an accepted signup into an error.
  }
}

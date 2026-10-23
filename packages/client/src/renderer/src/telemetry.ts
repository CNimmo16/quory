// Bundle extensions locally: Electron must not execute remotely loaded scripts.
import "posthog-js/dist/posthog-recorder";
import "posthog-js/dist/exception-autocapture";
import posthog from "posthog-js/dist/module.no-external";
import { version } from "../../../package.json";
import { POSTHOG_HOST, POSTHOG_TOKEN } from "../../shared/telemetry";

let initialized = false;
let privacy = { analytics: true, errors: true };
export function initializeTelemetry(
  preferences = { analytics: true, errors: true },
) {
  if (!import.meta.env.PROD) return;
  privacy = preferences;
  if (!initialized && !privacy.analytics && !privacy.errors) return;
  if (initialized) {
    posthog.set_config({
      capture_exceptions: {
        capture_unhandled_errors: privacy.errors,
        capture_unhandled_rejections: privacy.errors,
        capture_console_errors: false,
      },
      disable_session_recording: !privacy.analytics,
    });
    if (privacy.analytics || privacy.errors)
      posthog.opt_in_capturing({ captureEventName: false });
    else posthog.opt_out_capturing();
    if (privacy.analytics) posthog.startSessionRecording();
    else posthog.stopSessionRecording();
    return;
  }
  initialized = true;

  posthog.init(POSTHOG_TOKEN, {
    api_host: POSTHOG_HOST,
    ui_host: "https://eu.posthog.com",
    persistence: "localStorage", // Packaged windows use file://, which has no cookies.
    person_profiles: "never",
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_dead_clicks: false,
    capture_performance: false,
    disable_surveys: true,
    capture_exceptions: {
      capture_unhandled_errors: privacy.errors,
      capture_unhandled_rejections: privacy.errors,
      capture_console_errors: false,
    },
    disable_session_recording: !privacy.analytics,
    opt_out_capturing_by_default: !privacy.analytics && !privacy.errors,
    before_send: (event) => {
      if (!event) return null;
      return (event.event === "$exception" ? privacy.errors : privacy.analytics)
        ? event
        : null;
    },
    enable_recording_console_log: false,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "*",
      // Names and values can also appear in tooltips and accessibility labels.
      maskAttributeFn: (name, value) =>
        ["title", "aria-label", "alt", "placeholder", "value"].includes(name)
          ? "[redacted]"
          : value,
      recordHeaders: false,
      recordBody: false,
      recordCrossOriginIframes: false,
      captureCanvas: { recordCanvas: false },
      // Avoid recording the local install path or hash-router query parameters.
      maskCapturedNetworkRequestFn: (request) => ({
        ...request,
        name: "quory://app",
      }),
    },
    property_denylist: ["$current_url", "$pathname", "$initial_current_url"],
    loaded: (client) => {
      client.register({
        app: "quory-client",
        app_version: version,
        runtime: "renderer",
      });
    },
  });
}

export function captureRendererException(error: unknown) {
  if (import.meta.env.PROD && initialized && privacy.errors)
    posthog.captureException(error);
}

// Bundle extensions locally: Electron must not execute remotely loaded scripts.
import "posthog-js/dist/posthog-recorder";
import "posthog-js/dist/exception-autocapture";
import posthog from "posthog-js/dist/module.no-external";
import { version } from "../../../package.json";
import { POSTHOG_HOST, POSTHOG_TOKEN } from "../../shared/telemetry";

export function initializeTelemetry() {
  if (!import.meta.env.PROD) return;

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
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    },
    disable_session_recording: false,
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
  if (import.meta.env.PROD) posthog.captureException(error);
}

import { app } from "electron";
import { PostHog } from "posthog-node";
import { POSTHOG_HOST, POSTHOG_TOKEN } from "../shared/telemetry";

const posthog = app.isPackaged
  ? new PostHog(POSTHOG_TOKEN, {
      host: POSTHOG_HOST,
      enableExceptionAutocapture: true,
      before_send: (event) =>
        event && {
          ...event,
          properties: {
            ...event.properties,
            app: "quory-client",
            app_version: app.getVersion(),
            runtime: "main",
            platform: process.platform,
            $process_person_profile: false,
          },
        },
    })
  : undefined;

export async function shutdownTelemetry() {
  await posthog?.shutdown(2000);
}

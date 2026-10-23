import { app } from "electron";
import { PostHog } from "posthog-node";
import { POSTHOG_HOST, POSTHOG_TOKEN } from "../shared/telemetry";

let posthog: PostHog | undefined;
let errorReporting = false;
export function configureTelemetry(privacy: { errors: boolean }) {
  if (privacy.errors === errorReporting) return;
  errorReporting = privacy.errors;
  const previous = posthog;
  posthog = undefined;
  void previous?.shutdown(2000);
  if (!app.isPackaged || !privacy.errors) return;
  posthog = new PostHog(POSTHOG_TOKEN, {
    host: POSTHOG_HOST,
    enableExceptionAutocapture: true,
    before_send: (event) =>
      errorReporting && event
        ? {
            ...event,
            properties: {
              ...event.properties,
              app: "quory-client",
              app_version: app.getVersion(),
              runtime: "main",
              platform: process.platform,
              $process_person_profile: false,
            },
          }
        : null,
  });
}

export async function shutdownTelemetry() {
  await posthog?.shutdown(2000);
}

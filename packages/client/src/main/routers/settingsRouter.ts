import { app, clipboard, shell } from "electron";
import { generateText } from "ai";
import { z } from "zod";
import { publicProcedure, router } from "../util/trpc";
import { settingsStore, secureStorageAvailable } from "../settings";
import {
  aiSettingsSchema,
  providerSettingsSchema,
  preferencesSchema,
  providerSchema,
  modelDiscoverySchema,
  endpointSchema,
} from "../../shared/settings";
import { getQueryModel } from "../ai/model";
import { configureTelemetry } from "../telemetry";
import { applyNativeAppearance } from "../settings/appearance";
import { mkdirSync } from "node:fs";
import { runDecision } from "../ai/decisions";
import { discoverModels } from "../ai/models";

const links = {
  updates: "https://github.com/CNimmo16/quory/releases/latest",
  releases: "https://github.com/CNimmo16/quory/releases",
  docs: "https://usequory.com/docs/",
  issue: "https://github.com/CNimmo16/quory/issues/new",
};
export default router({
  get: publicProcedure.query(() => ({
    preferences: settingsStore().preferences(),
    ai: settingsStore().ai(),
    secureStorageAvailable: secureStorageAvailable(),
    version: app.getVersion(),
    platform: process.platform,
  })),
  savePreferences: publicProcedure
    .input(preferencesSchema)
    .mutation(({ input }) => {
      settingsStore().savePreferences(input);
      applyNativeAppearance(input.appearance);
      configureTelemetry(input.privacy);
      return settingsStore().preferences();
    }),
  saveProvider: publicProcedure
    .input(providerSettingsSchema)
    .mutation(({ input }) => {
      settingsStore().saveProvider(input);
      return settingsStore().ai();
    }),
  saveAI: publicProcedure.input(aiSettingsSchema).mutation(({ input }) => {
    settingsStore().saveAI(input);
    return settingsStore().ai();
  }),
  removeKey: publicProcedure
    .input(
      z.union([
        providerSchema,
        z.object({
          provider: providerSchema,
          baseURL: endpointSchema.optional(),
        }),
      ]),
    )
    .mutation(({ input }) => {
      if (typeof input === "string") settingsStore().removeKey(input);
      else settingsStore().removeKey(input.provider, input.baseURL);
      return settingsStore().ai();
    }),
  models: publicProcedure
    .input(modelDiscoverySchema)
    .mutation(({ input }) =>
      discoverModels(input, (provider, baseURL) =>
        settingsStore().credential(provider, baseURL),
      ),
    ),
  testAI: publicProcedure.mutation(async () => {
    try {
      await generateText({
        model: getQueryModel(settingsStore().environment()),
        prompt: "Reply with OK.",
        maxOutputTokens: 16,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(20_000),
      });
      return { success: true, message: "Connection successful." };
    } catch {
      return {
        success: false,
        message:
          "Connection failed. Check your saved API key, model access, billing, and network connection.",
      };
    }
  }),
  testDecision: publicProcedure.mutation(async () => {
    try {
      const store = settingsStore();
      const selection = store.ai().decision;
      if (!selection)
        return {
          success: false,
          message: "Choose and save a decision model first.",
        };
      await runDecision(
        selection,
        store.credential(selection.provider),
        {
          input: "The sky is blue.",
          questions: [
            {
              name: "connection_test",
              type: "predicate",
              instructions: "Does the text describe the sky as blue?",
            },
          ],
        },
        selection.provider === "cloudflare"
          ? { accountId: store.ai().providers.cloudflare.accountId }
          : {},
      );
      return { success: true, message: "Decision connection successful." };
    } catch {
      return {
        success: false,
        message:
          "Decision connection failed. Check the saved key, model access, billing, and network connection.",
      };
    }
  }),
  openLink: publicProcedure
    .input(z.enum(["updates", "releases", "docs", "issue"]))
    .mutation(async ({ input }) => {
      await shell.openExternal(links[input]);
    }),
  openLogs: publicProcedure.mutation(async () => {
    mkdirSync(app.getPath("logs"), { recursive: true });
    const error = await shell.openPath(app.getPath("logs"));
    if (error) throw new Error("Could not open the logs folder.");
  }),
  copyDiagnostics: publicProcedure.mutation(() => {
    // Deliberate allowlist: no environment, settings, paths, queries, or credentials.
    clipboard.writeText(
      JSON.stringify(
        {
          app: "Quory",
          version: app.getVersion(),
          platform: process.platform,
          arch: process.arch,
          electron: process.versions.electron,
          node: process.versions.node,
        },
        null,
        2,
      ),
    );
  }),
});

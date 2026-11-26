import { z } from "zod";

export const providerSchema = z.enum([
  "openai",
  "anthropic",
  "google",
  "custom",
  "typesafe",
  "cloudflare",
]);
export const cloudflareAccountIdSchema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{32}$/, "Enter a 32-character Cloudflare account ID.");
export const endpointSchema = z
  .string()
  .trim()
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash
      );
    } catch {
      return false;
    }
  }, "Enter an HTTP or HTTPS API base URL without credentials, query parameters, or fragments.")
  .transform((value) => new URL(value).toString().replace(/\/+$/, ""));
export const modelDiscoverySchema = z
  .object({
    provider: providerSchema,
    purpose: z.enum(["assistant", "decision"]).default("assistant"),
    baseURL: endpointSchema.optional(),
    apiKey: z.string().trim().min(1).max(4096).optional(),
  })
  .superRefine((value, context) => {
    if (value.provider === "custom" && !value.baseURL)
      context.addIssue({
        code: "custom",
        path: ["baseURL"],
        message: "Enter the custom endpoint's API base URL.",
      });
  });
export const preferencesSchema = z.object({
  appearance: z.object({
    theme: z.enum(["system", "light", "dark"]),
    editorFontSize: z.number().int().min(10).max(24),
    density: z.enum(["comfortable", "compact"]),
  }),
  privacy: z.object({ analytics: z.boolean(), errors: z.boolean() }),
});
export const defaultPreferences = {
  appearance: { theme: "system", editorFontSize: 13, density: "comfortable" },
  privacy: { analytics: true, errors: true },
} satisfies z.infer<typeof preferencesSchema>;
export type Preferences = z.infer<typeof preferencesSchema>;
export const assistantProviderSchema = z.enum([
  "openai",
  "anthropic",
  "google",
  "custom",
]);
export const decisionProviderSchema = z.enum([
  "openai",
  "google",
  "typesafe",
  "cloudflare",
]);
const modelIdSchema = z.string().trim().min(1).max(200);
export const assistantSelectionSchema = z.object({
  provider: assistantProviderSchema,
  model: modelIdSchema,
});
export const decisionSelectionSchema = z.object({
  provider: decisionProviderSchema,
  model: modelIdSchema,
});
export const aiSettingsSchema = z.discriminatedUnion("purpose", [
  z.object({
    purpose: z.literal("assistant"),
    selection: assistantSelectionSchema,
  }),
  z.object({
    purpose: z.literal("decision"),
    selection: decisionSelectionSchema.nullable(),
  }),
]);
export const providerSettingsSchema = z
  .object({
    provider: providerSchema,
    apiKey: z.string().trim().min(1).max(4096).optional(),
    baseURL: endpointSchema.optional(),
    accountId: cloudflareAccountIdSchema.optional(),
  })
  .superRefine((value, context) => {
    if (value.provider === "cloudflare" && !value.accountId)
      context.addIssue({
        code: "custom",
        path: ["accountId"],
        message: "Enter your Cloudflare account ID.",
      });
    if (value.provider === "custom" && !value.baseURL)
      context.addIssue({
        code: "custom",
        path: ["baseURL"],
        message: "Enter the custom endpoint's API base URL.",
      });
  });
export type AISettingsInput = z.infer<typeof aiSettingsSchema>;
export type ProviderSettingsInput = z.infer<typeof providerSettingsSchema>;
export type Provider = z.infer<typeof providerSchema>;
export type DecisionSelection = z.infer<typeof decisionSelectionSchema>;
export type AssistantSelection = z.infer<typeof assistantSelectionSchema>;
export type ProviderProfile = {
  accountId?: string;
  baseURL?: string;
  hasSavedKey: boolean;
  hasEnvironmentKey: boolean;
};
export type AISettingsPublic = {
  assistant: AssistantSelection;
  decision: DecisionSelection | null;
  providers: Record<Provider, ProviderProfile>;
  assistantModels: Partial<Record<Provider, string>>;
};
export const providerNames: Record<Provider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google AI Studio (Gemini API)",
  custom: "Custom (OpenAI-compatible)",
  typesafe: "TypeSafe / Jev",
  cloudflare: "Cloudflare",
};
export type ModelOption = { id: string; name: string };
export type ModelDiscovery = {
  models: ModelOption[];
  source: "provider" | "catalog" | "documented";
  notice?: string;
};

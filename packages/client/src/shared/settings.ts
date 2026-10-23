import { z } from "zod";

export const providerSchema = z.enum([
  "openai",
  "anthropic",
  "google",
  "custom",
]);
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
export const aiSettingsSchema = z
  .object({
    provider: providerSchema,
    model: z.string().trim().min(1).max(200),
    apiKey: z.string().trim().min(1).max(4096).optional(),
    baseURL: endpointSchema.optional(),
  })
  .superRefine((value, context) => {
    if (value.provider === "custom" && !value.baseURL)
      context.addIssue({
        code: "custom",
        path: ["baseURL"],
        message: "Enter the custom endpoint's API base URL.",
      });
  });
export type AISettingsInput = z.infer<typeof aiSettingsSchema>;
export type Provider = z.infer<typeof providerSchema>;
export type AIProfile = {
  model: string;
  baseURL?: string;
  hasSavedKey: boolean;
  hasEnvironmentKey: boolean;
};
export type AISettingsPublic = AIProfile & {
  provider: Provider;
  profiles: Record<Provider, AIProfile>;
};
export type ModelOption = { id: string; name: string };
export type ModelDiscovery = {
  models: ModelOption[];
  source: "provider" | "catalog";
  notice?: string;
};

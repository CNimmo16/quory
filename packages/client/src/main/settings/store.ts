import { z } from "zod";
import { validDecisionModel } from "../../shared/decisionModels";
import {
  defaultPreferences,
  preferencesSchema,
  providerSchema,
  endpointSchema,
  cloudflareAccountIdSchema,
  aiSettingsSchema,
  providerSettingsSchema,
  assistantProviderSchema,
  assistantSelectionSchema,
  decisionSelectionSchema,
  type Preferences,
  type AISettingsInput,
  type ProviderSettingsInput,
  type Provider,
  type ProviderProfile,
  type AISettingsPublic,
} from "../../shared/settings";

// Accept both historical formats; all subsequent writes use separate connections
// and model selections. Encrypted key slots are preserved byte for byte.
const storedAISchema = z.object({
  provider: assistantProviderSchema.optional(),
  model: z.string().optional(),
  profiles: z
    .record(z.object({ model: z.string(), baseURL: endpointSchema.optional() }))
    .default({}),
  keys: z.record(z.string()).default({}),
  providers: z
    .record(
      z.object({
        baseURL: endpointSchema.optional(),
        accountId: cloudflareAccountIdSchema.optional(),
      }),
    )
    .optional(),
  assistant: assistantSelectionSchema.extend({ model: z.string() }).optional(),
  assistantModels: z.record(z.string()).optional(),
  decision: decisionSelectionSchema.nullable().optional(),
});
const stateSchema = z.object({
  preferences: preferencesSchema,
  ai: storedAISchema.optional(),
});
type State = z.infer<typeof stateSchema>;
export function createSettingsStore(
  io: {
    read: () => unknown;
    write: (state: State) => void;
    encrypt: (key: string) => string;
    decrypt: (value: string) => string;
  },
  env: NodeJS.ProcessEnv = process.env,
) {
  const envProvider = assistantProviderSchema
    .catch("openai")
    .parse(env.AI_PROVIDER);
  const envEndpoint = endpointSchema.safeParse(env.AI_BASE_URL);
  const envBaseURL = envEndpoint.success ? envEndpoint.data : undefined;
  const envKeys: Record<Provider, string | undefined> = {
    openai: env.OPENAI_API_KEY || env.OPEN_AI_API_KEY,
    anthropic: env.ANTHROPIC_API_KEY,
    google: env.GOOGLE_GENERATIVE_AI_API_KEY || env.GEMINI_API_KEY,
    custom: env.CUSTOM_OPENAI_API_KEY,
    typesafe: env.TYPESAFE_API_KEY,
    cloudflare: env.CLOUDFLARE_API_TOKEN || env.CLOUDFLARE_AUTH_TOKEN,
  };
  let state: State | undefined;
  function read(): State {
    if (!state) {
      const raw = io.read();
      const parsed =
        raw === undefined
          ? { preferences: structuredClone(defaultPreferences) }
          : stateSchema.parse(raw);
      const old = parsed.ai;
      const provider = old?.provider ?? envProvider;
      const assistantModels =
        old?.assistantModels ??
        Object.fromEntries(
          Object.entries(old?.profiles ?? {}).map(([key, value]) => [
            key,
            value.model,
          ]),
        );
      if (old?.model && !assistantModels[provider])
        assistantModels[provider] = old.model;
      if (!assistantModels[envProvider])
        assistantModels[envProvider] =
          env.AI_MODEL?.trim() ||
          (envProvider === "openai" ? "gpt-6-luna" : "");
      const providers: NonNullable<
        z.infer<typeof storedAISchema>["providers"]
      > =
        old?.providers ??
        Object.fromEntries(
          Object.entries(old?.profiles ?? {}).map(([key, value]) => [
            key,
            value.baseURL ? { baseURL: value.baseURL } : {},
          ]),
        );
      if (!providers.custom?.baseURL && envBaseURL)
        providers.custom = { baseURL: envBaseURL };
      const envAccount = cloudflareAccountIdSchema.safeParse(
        env.CLOUDFLARE_ACCOUNT_ID,
      );
      if (!providers.cloudflare?.accountId && envAccount.success)
        providers.cloudflare = { accountId: envAccount.data };
      state = {
        preferences: parsed.preferences,
        ai: {
          keys: old?.keys ?? {},
          profiles: {},
          providers,
          assistantModels,
          assistant: old?.assistant ?? {
            provider,
            model:
              assistantModels[provider] ||
              (provider === "openai" ? "gpt-6-luna" : ""),
          },
          decision: old?.decision ?? null,
        },
      };
    }
    return state;
  }
  function commit(next: State) {
    io.write(next);
    state = next;
  }
  function keySlot(provider: Provider, baseURL?: string) {
    return provider === "custom"
      ? `custom:${endpointSchema.parse(baseURL)}`
      : provider;
  }
  function profile(provider: Provider): ProviderProfile {
    const baseURL =
      provider === "custom" ? read().ai?.providers?.custom?.baseURL : undefined;
    const accountId =
      provider === "cloudflare"
        ? read().ai?.providers?.cloudflare?.accountId
        : undefined;
    return {
      ...(accountId ? { accountId } : {}),
      ...(baseURL ? { baseURL } : {}),
      hasSavedKey: Boolean(
        (provider !== "custom" || baseURL) &&
        read().ai?.keys[keySlot(provider, baseURL)],
      ),
      hasEnvironmentKey: Boolean(
        envKeys[provider] &&
        (provider !== "custom" || (baseURL && baseURL === envBaseURL)),
      ),
    };
  }
  function ai(): AISettingsPublic {
    const saved = read().ai!;
    return {
      assistant: { ...saved.assistant! },
      decision: saved.decision ? { ...saved.decision } : null,
      providers: Object.fromEntries(
        providerSchema.options.map((p) => [p, profile(p)]),
      ) as Record<Provider, ProviderProfile>,
      assistantModels: { ...saved.assistantModels },
    };
  }
  function credential(provider: Provider, baseURL?: string) {
    if (provider === "custom" && !baseURL) return undefined;
    const encrypted = read().ai?.keys[keySlot(provider, baseURL)];
    if (!encrypted)
      return provider !== "custom" ||
        (baseURL && endpointSchema.parse(baseURL) === envBaseURL)
        ? envKeys[provider]
        : undefined;
    try {
      return io.decrypt(encrypted);
    } catch {
      throw new Error(
        "Could not unlock the saved AI key. Remove it and save it again in Settings → AI.",
      );
    }
  }
  return {
    preferences: () => structuredClone(read().preferences),
    ai,
    credential,
    savePreferences(preferences: Preferences) {
      commit({ ...read(), preferences: preferencesSchema.parse(preferences) });
    },
    saveProvider(value: ProviderSettingsInput) {
      const input = providerSettingsSchema.parse(value);
      const current = read();
      const keys = { ...current.ai!.keys };
      if (input.apiKey)
        keys[keySlot(input.provider, input.baseURL)] = io.encrypt(input.apiKey);
      commit({
        ...current,
        ai: {
          ...current.ai!,
          keys,
          providers: {
            ...current.ai!.providers,
            [input.provider]:
              input.provider === "custom"
                ? { baseURL: input.baseURL }
                : input.provider === "cloudflare"
                  ? { accountId: input.accountId }
                  : {},
          },
        },
      });
    },
    saveAI(value: AISettingsInput) {
      const input = aiSettingsSchema.parse(value);
      const current = read();
      if (
        input.purpose === "decision" &&
        input.selection &&
        !validDecisionModel(input.selection)
      )
        throw new Error("Choose a supported decision model for this provider.");
      if (
        input.purpose === "assistant" &&
        input.selection.provider === "custom" &&
        !profile("custom").baseURL
      )
        throw new Error("Configure the custom provider's API base URL first.");
      commit({
        ...current,
        ai: {
          ...current.ai!,
          [input.purpose]: input.selection,
          ...(input.purpose === "assistant"
            ? {
                assistantModels: {
                  ...current.ai!.assistantModels,
                  [input.selection.provider]: input.selection.model,
                },
              }
            : {}),
        },
      });
    },
    removeKey(provider: Provider, baseURL?: string) {
      const current = read();
      const keys = { ...current.ai!.keys };
      delete keys[keySlot(provider, baseURL || profile(provider).baseURL)];
      commit({ ...current, ai: { ...current.ai!, keys } });
    },
    environment(): NodeJS.ProcessEnv {
      const selected = ai().assistant;
      const baseURL = profile(selected.provider).baseURL;
      const key = credential(selected.provider, baseURL);
      const keyName = {
        openai: "OPENAI_API_KEY",
        anthropic: "ANTHROPIC_API_KEY",
        google: "GOOGLE_GENERATIVE_AI_API_KEY",
        custom: "CUSTOM_OPENAI_API_KEY",
      }[selected.provider];
      return {
        ...env,
        AI_PROVIDER: selected.provider,
        AI_MODEL: selected.model,
        AI_BASE_URL: baseURL,
        [keyName]: key,
      };
    },
  };
}

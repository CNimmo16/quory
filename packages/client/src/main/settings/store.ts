import { z } from "zod";
import {
  defaultPreferences,
  preferencesSchema,
  providerSchema,
  endpointSchema,
  aiSettingsSchema,
  type Preferences,
  type AISettingsInput,
  type Provider,
  type AIProfile,
  type AISettingsPublic,
} from "../../shared/settings";

const stateSchema = z.object({
  preferences: preferencesSchema,
  ai: z
    .object({
      provider: providerSchema,
      // Read the previous selected-model format without losing existing keys.
      model: z.string().optional(),
      keys: z.record(z.string()),
      profiles: z
        .record(
          z.object({ model: z.string(), baseURL: endpointSchema.optional() }),
        )
        .default({}),
    })
    .optional(),
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
  let state: State | undefined;
  function read(): State {
    if (!state) {
      const raw = io.read();
      const parsed: State =
        raw === undefined
          ? { preferences: structuredClone(defaultPreferences) }
          : stateSchema.parse(raw);
      if (parsed.ai?.model && !parsed.ai.profiles[parsed.ai.provider]) {
        parsed.ai.profiles[parsed.ai.provider] = { model: parsed.ai.model };
      }
      state = parsed;
    }
    return state;
  }
  function commit(next: State) {
    io.write(next);
    state = next;
  }
  const envProvider = providerSchema.catch("openai").parse(env.AI_PROVIDER);
  const envEndpoint = endpointSchema.safeParse(env.AI_BASE_URL);
  const envBaseURL = envEndpoint.success ? envEndpoint.data : undefined;
  const envKeys = {
    openai: env.OPENAI_API_KEY || env.OPEN_AI_API_KEY,
    anthropic: env.ANTHROPIC_API_KEY,
    google: env.GOOGLE_GENERATIVE_AI_API_KEY,
    custom: env.CUSTOM_OPENAI_API_KEY,
  };
  function keySlot(provider: Provider, baseURL?: string) {
    return provider === "custom"
      ? `custom:${endpointSchema.parse(baseURL)}`
      : provider;
  }
  function profile(provider: Provider): AIProfile {
    const saved = read().ai?.profiles[provider];
    const baseURL =
      provider === "custom"
        ? saved?.baseURL || (envProvider === "custom" ? envBaseURL : undefined)
        : undefined;
    return {
      model:
        saved?.model ||
        (envProvider === provider ? env.AI_MODEL : undefined) ||
        (provider === "openai" ? "gpt-6-luna" : ""),
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
    const provider = read().ai?.provider ?? envProvider;
    const profiles = Object.fromEntries(
      providerSchema.options.map((p) => [p, profile(p)]),
    ) as Record<Provider, AIProfile>;
    return { provider, ...profiles[provider], profiles };
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
    saveAI(value: AISettingsInput) {
      const input = aiSettingsSchema.parse(value);
      const current = read();
      const keys = { ...current.ai?.keys };
      if (input.apiKey)
        keys[keySlot(input.provider, input.baseURL)] = io.encrypt(input.apiKey);
      commit({
        ...current,
        ai: {
          provider: input.provider,
          keys,
          profiles: {
            ...current.ai?.profiles,
            [input.provider]: {
              model: input.model,
              ...(input.provider === "custom"
                ? { baseURL: input.baseURL }
                : {}),
            },
          },
        },
      });
    },
    removeKey(provider: Provider, baseURL?: string) {
      const current = read();
      if (!current.ai) return;
      const keys = { ...current.ai.keys };
      delete keys[keySlot(provider, baseURL || profile(provider).baseURL)];
      commit({ ...current, ai: { ...current.ai, keys } });
    },
    environment(): NodeJS.ProcessEnv {
      const selected = ai();
      const key = credential(selected.provider, selected.baseURL);
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
        AI_BASE_URL: selected.baseURL,
        [keyName]: key,
      };
    },
  };
}

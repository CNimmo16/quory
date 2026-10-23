import { createProviderRegistry } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { endpointSchema } from "../../shared/settings";

let environment = () => process.env;
export function configureQueryModelEnvironment(
  resolve: () => NodeJS.ProcessEnv,
) {
  environment = resolve;
}
export function getQueryModel(env: NodeJS.ProcessEnv = environment()) {
  const provider = env.AI_PROVIDER?.trim() || "openai";
  const model =
    env.AI_MODEL?.trim() || (provider === "openai" ? "gpt-6-luna" : "");
  if (provider === "custom") {
    if (!model)
      throw new Error(
        "Choose a model in Settings → AI for the custom endpoint.",
      );
    const endpoint = endpointSchema.safeParse(env.AI_BASE_URL);
    if (!endpoint.success)
      throw new Error("Enter a valid custom API base URL in Settings → AI.");
    const apiKey = env.CUSTOM_OPENAI_API_KEY?.trim();
    return createOpenAI({
      baseURL: endpoint.data,
      apiKey: apiKey || "not-required",
      fetch: (url, options) => {
        const headers = new Headers(options?.headers);
        if (!apiKey) headers.delete("authorization");
        return fetch(url, { ...options, headers, redirect: "error" });
      },
    }).chat(model);
  }
  const keys = {
    openai: env.OPENAI_API_KEY || env.OPEN_AI_API_KEY,
    anthropic: env.ANTHROPIC_API_KEY,
    google: env.GOOGLE_GENERATIVE_AI_API_KEY,
  };
  if (!Object.prototype.hasOwnProperty.call(keys, provider))
    throw new Error(
      "AI_PROVIDER must be openai, anthropic, google, or custom.",
    );
  if (!model)
    throw new Error(
      "Choose a model in Settings → AI for the selected provider.",
    );
  const selectedProvider = provider as keyof typeof keys;
  if (!keys[selectedProvider]?.trim()) {
    const keyName = {
      openai: "OPENAI_API_KEY (or OPEN_AI_API_KEY)",
      anthropic: "ANTHROPIC_API_KEY",
      google: "GOOGLE_GENERATIVE_AI_API_KEY",
    }[selectedProvider];
    throw new Error(
      `Add ${keyName} in Settings → AI to use ${provider}. Manual mode is still available.`,
    );
  }
  const registry = createProviderRegistry({
    openai: createOpenAI({ apiKey: keys.openai ?? "" }),
    anthropic: createAnthropic({ apiKey: keys.anthropic ?? "" }),
    google: createGoogleGenerativeAI({ apiKey: keys.google ?? "" }),
  });
  return registry.languageModel(`${selectedProvider}:${model}`);
}

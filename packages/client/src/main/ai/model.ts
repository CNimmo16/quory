import { createProviderRegistry } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

export function getQueryModel(env: NodeJS.ProcessEnv = process.env) {
  const provider = env.AI_PROVIDER?.trim() || "openai";
  const model =
    env.AI_MODEL?.trim() || (provider === "openai" ? "gpt-6-luna" : "");
  const keys = {
    openai: env.OPENAI_API_KEY || env.OPEN_AI_API_KEY,
    anthropic: env.ANTHROPIC_API_KEY,
    google: env.GOOGLE_GENERATIVE_AI_API_KEY,
  };
  if (!Object.prototype.hasOwnProperty.call(keys, provider))
    throw new Error("AI_PROVIDER must be openai, anthropic, or google.");
  if (!model)
    throw new Error(
      "Set AI_MODEL in the root .env.local for the selected AI_PROVIDER."
    );
  const selectedProvider = provider as keyof typeof keys;
  if (!keys[selectedProvider]?.trim()) {
    const keyName = {
      openai: "OPENAI_API_KEY (or OPEN_AI_API_KEY)",
      anthropic: "ANTHROPIC_API_KEY",
      google: "GOOGLE_GENERATIVE_AI_API_KEY",
    }[selectedProvider];
    throw new Error(
      `Set ${keyName} in the root .env.local to use ${provider}. Manual mode is still available.`
    );
  }
  const registry = createProviderRegistry({
    openai: createOpenAI({ apiKey: keys.openai ?? "" }),
    anthropic: createAnthropic({ apiKey: keys.anthropic ?? "" }),
    google: createGoogleGenerativeAI({ apiKey: keys.google ?? "" }),
  });
  return registry.languageModel(`${selectedProvider}:${model}`);
}

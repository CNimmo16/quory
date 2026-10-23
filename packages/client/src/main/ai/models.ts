import { z } from "zod";
import {
  modelDiscoverySchema,
  type ModelDiscovery,
  type ModelOption,
  type Provider,
} from "../../shared/settings";

const modelSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().max(300).optional(),
  display_name: z.string().max(300).optional(),
});
const listSchema = z.object({
  data: z.array(modelSchema).max(5000),
  has_more: z.boolean().optional(),
  last_id: z.string().optional(),
});
let catalogue: { expires: number; data: unknown } | undefined;
let catalogueRequest: Promise<unknown> | undefined;

async function publicCatalogue(fetcher: typeof fetch) {
  if (catalogue && catalogue.expires > Date.now()) return catalogue.data;
  // Share only the public, credential-free catalogue across requests.
  if (fetcher === fetch && catalogueRequest) return catalogueRequest;
  const request = (async () => {
    const response = await fetcher("https://models.dev/api.json", {
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error("Catalogue unavailable");
    const data: unknown = await response.json();
    if (fetcher === fetch)
      catalogue = { data, expires: Date.now() + 15 * 60_000 };
    return data;
  })();
  if (fetcher === fetch) catalogueRequest = request;
  try {
    return await request;
  } finally {
    if (fetcher === fetch) catalogueRequest = undefined;
  }
}
function sorted(models: ModelOption[]) {
  return [...new Map(models.map((model) => [model.id, model])).values()].sort(
    (a, b) => a.name.localeCompare(b.name),
  );
}
async function catalogueModels(
  provider: Provider,
  fetcher: typeof fetch,
): Promise<ModelDiscovery> {
  const data = z.record(z.unknown()).parse(await publicCatalogue(fetcher));
  const providerData = z
    .object({ models: z.record(z.unknown()) })
    .parse(data[provider]);
  const entry = z.object({
    id: z.string().min(1).max(200),
    name: z.string().max(300),
    tool_call: z.boolean().optional(),
    status: z.string().optional(),
    modalities: z.object({ output: z.array(z.string()) }).optional(),
  });
  const models = Object.values(providerData.models).flatMap((raw) => {
    const parsed = entry.safeParse(raw);
    if (
      !parsed.success ||
      !parsed.data.tool_call ||
      !parsed.data.modalities?.output.includes("text") ||
      parsed.data.status === "deprecated"
    )
      return [];
    return [{ id: parsed.data.id, name: parsed.data.name }];
  });
  if (!models.length) throw new Error("No catalogue models");
  return { models: sorted(models), source: "catalog" };
}
async function providerModels(
  provider: Provider,
  apiKey: string | undefined,
  baseURL: string | undefined,
  fetcher: typeof fetch,
): Promise<ModelDiscovery> {
  const root =
    provider === "google"
      ? "https://generativelanguage.googleapis.com/v1beta/models"
      : provider === "anthropic"
        ? "https://api.anthropic.com/v1/models"
        : provider === "openai"
          ? "https://api.openai.com/v1/models"
          : `${baseURL}/models`;
  const headers: Record<string, string> = {};
  if (apiKey) {
    if (provider === "google") headers["x-goog-api-key"] = apiKey;
    else if (provider === "anthropic") headers["x-api-key"] = apiKey;
    else headers.Authorization = `Bearer ${apiKey}`;
  }
  if (provider === "anthropic") headers["anthropic-version"] = "2023-06-01";
  const models: ModelOption[] = [];
  const signal = AbortSignal.timeout(15_000);
  let pageToken: string | undefined;
  const visited = new Set<string>();
  for (let page = 0; page < 20; page++) {
    const url = new URL(root);
    if (provider === "google") {
      url.searchParams.set("pageSize", "1000");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
    }
    if (provider === "anthropic") {
      url.searchParams.set("limit", "1000");
      if (pageToken) url.searchParams.set("after_id", pageToken);
    }
    const response = await fetcher(url.toString(), {
      headers,
      signal,
      redirect: "error",
    });
    if (!response.ok) throw new Error("Provider model listing failed");
    const body: unknown = await response.json();
    let next: string | undefined;
    if (provider === "google") {
      const result = z
        .object({
          models: z
            .array(
              z.object({
                name: z.string().max(210),
                displayName: z.string().max(300).optional(),
                supportedGenerationMethods: z.array(z.string()).optional(),
              }),
            )
            .max(5000),
          nextPageToken: z.string().optional(),
        })
        .parse(body);
      models.push(
        ...result.models
          .filter(
            (m) =>
              m.supportedGenerationMethods?.includes("generateContent") &&
              !/image|tts|audio|embedding|robotics|veo|live/i.test(m.name),
          )
          .map((m) => ({
            id: m.name.replace(/^models\//, ""),
            name: m.displayName || m.name.replace(/^models\//, ""),
          })),
      );
      next = result.nextPageToken;
    } else {
      const result = listSchema.parse(body);
      models.push(
        ...result.data
          .filter(
            (m) =>
              provider !== "openai" ||
              (/^(?:ft:)?(?:gpt-|o\d|chatgpt-|codex-)/.test(m.id) &&
                !/image|audio|tts|transcribe|realtime|embedding|moderation/.test(
                  m.id,
                )),
          )
          .map((m) => ({ id: m.id, name: m.display_name || m.name || m.id })),
      );
      if (provider === "anthropic" && result.has_more) {
        if (!result.last_id) throw new Error("Missing pagination cursor");
        next = result.last_id;
      }
    }
    if (!next) break;
    if (visited.has(next) || page === 19)
      throw new Error("Provider pagination failed");
    visited.add(next);
    pageToken = next;
  }
  if (!models.length) throw new Error("No chat models returned");
  return { models: sorted(models), source: "provider" };
}
export async function discoverModels(
  value: z.input<typeof modelDiscoverySchema>,
  credential: (provider: Provider, baseURL?: string) => string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<ModelDiscovery> {
  const input = modelDiscoverySchema.parse(value);
  try {
    const key = input.apiKey || credential(input.provider, input.baseURL);
    if (key || input.provider === "custom") {
      try {
        return await providerModels(
          input.provider,
          key,
          input.baseURL,
          fetcher,
        );
      } catch {
        if (input.provider === "custom")
          throw new Error("Custom model listing unavailable");
        return {
          ...(await catalogueModels(input.provider, fetcher)),
          notice:
            "Could not load your account’s model list. Showing the public catalogue; model access may vary.",
        };
      }
    }
    return await catalogueModels(input.provider, fetcher);
  } catch {
    // Never forward HTTP errors, response bodies, or URLs containing credentials.
    throw new Error(
      "Could not load models. Check the key, endpoint, and network connection, or enter a model ID manually.",
    );
  }
}

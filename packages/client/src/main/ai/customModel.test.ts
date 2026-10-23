import { afterEach, expect, it, vi } from "vitest";
import { generateText } from "ai";
import { getQueryModel } from "./model";

afterEach(() => vi.unstubAllGlobals());
it("uses Chat Completions at the custom URL without leaking the built-in OpenAI key", async () => {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          id: "local-response",
          object: "chat.completion",
          created: 1,
          model: "local/model:latest",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "OK" },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
  );
  vi.stubGlobal("fetch", fetcher);
  const model = getQueryModel({
    AI_PROVIDER: "custom",
    AI_MODEL: "local/model:latest",
    AI_BASE_URL: "http://localhost:1234/v1",
    OPENAI_API_KEY: "official-secret",
  });
  const result = await generateText({ model, prompt: "Hello", maxRetries: 0 });
  expect(result.text).toBe("OK");
  expect(String(fetcher.mock.lastCall![0])).toBe(
    "http://localhost:1234/v1/chat/completions",
  );
  expect(
    new Headers(fetcher.mock.lastCall![1]?.headers).has("authorization"),
  ).toBe(false);
  expect(fetcher.mock.lastCall![1]?.redirect).toBe("error");
  expect(JSON.parse(String(fetcher.mock.lastCall![1]?.body))).toMatchObject({
    model: "local/model:latest",
  });
});
it("validates the custom base URL before constructing the model", () => {
  expect(() =>
    getQueryModel({
      AI_PROVIDER: "custom",
      AI_MODEL: "local",
      AI_BASE_URL: "file:///private",
    }),
  ).toThrow("valid custom API base URL");
});

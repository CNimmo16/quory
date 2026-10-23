import { describe, expect, it, vi } from "vitest";
import { discoverModels } from "./models";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
describe("live model discovery", () => {
  it("populates a credential-free catalogue with tool-capable text models only", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      json({
        openai: {
          models: {
            good: {
              id: "chat-model",
              name: "Chat model",
              tool_call: true,
              modalities: { output: ["text"] },
            },
            retired: {
              id: "old",
              name: "Old",
              tool_call: true,
              status: "deprecated",
              modalities: { output: ["text"] },
            },
            image: {
              id: "image",
              name: "Image",
              tool_call: true,
              modalities: { output: ["image"] },
            },
            noTools: {
              id: "plain",
              name: "Plain",
              tool_call: false,
              modalities: { output: ["text"] },
            },
          },
        },
      }),
    );
    const result = await discoverModels(
      { provider: "openai" },
      () => undefined,
      fetcher,
    );
    expect(result).toEqual({
      source: "catalog",
      models: [{ id: "chat-model", name: "Chat model" }],
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://models.dev/api.json",
      expect.not.objectContaining({ headers: expect.anything() }),
    );
  });
  it("uses the selected OpenAI key only at the official endpoint and filters non-chat models", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        json({
          data: [
            { id: "gpt-chat" },
            { id: "text-embedding-3-small" },
            { id: "gpt-image-1" },
            { id: "gpt-chat" },
          ],
        }),
      );
    const credential = vi.fn(() => "saved-openai-key");
    const result = await discoverModels(
      { provider: "openai", baseURL: "https://wrong.example/v1" },
      credential,
      fetcher,
    );
    expect(result.models).toEqual([{ id: "gpt-chat", name: "gpt-chat" }]);
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.openai.com/v1/models",
      expect.objectContaining({
        headers: { Authorization: "Bearer saved-openai-key" },
        redirect: "error",
      }),
    );
    expect(credential).toHaveBeenCalledWith(
      "openai",
      "https://wrong.example/v1",
    );
  });
  it("paginates Anthropic models and retains display names", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({
          data: [{ id: "claude-one", display_name: "Claude One" }],
          has_more: true,
          last_id: "claude-one",
        }),
      )
      .mockResolvedValueOnce(
        json({
          data: [{ id: "claude-two", display_name: "Claude Two" }],
          has_more: false,
        }),
      );
    const result = await discoverModels(
      { provider: "anthropic" },
      () => "anthropic-key",
      fetcher,
    );
    expect(result.models).toHaveLength(2);
    expect(fetcher.mock.calls[1]![0]).toContain("after_id=claude-one");
    expect(fetcher.mock.calls[0]![1]?.headers).toMatchObject({
      "x-api-key": "anthropic-key",
      "anthropic-version": "2023-06-01",
    });
  });
  it("uses Google key headers, follows page tokens, and excludes embedding models", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({
          models: [
            {
              name: "models/gemini-chat",
              displayName: "Gemini Chat",
              supportedGenerationMethods: ["generateContent"],
            },
            {
              name: "models/embed",
              supportedGenerationMethods: ["embedContent"],
            },
          ],
          nextPageToken: "next page",
        }),
      )
      .mockResolvedValueOnce(
        json({
          models: [
            {
              name: "models/gemini-second",
              supportedGenerationMethods: ["generateContent"],
            },
          ],
        }),
      );
    const result = await discoverModels(
      { provider: "google" },
      () => "google-secret",
      fetcher,
    );
    expect(result.models.map((m) => m.id)).toEqual([
      "gemini-chat",
      "gemini-second",
    ]);
    expect(fetcher.mock.calls[1]![0]).toContain("pageToken=next+page");
    for (const [url, init] of fetcher.mock.calls) {
      expect(String(url)).not.toContain("google-secret");
      expect(init?.headers).toMatchObject({
        "x-goog-api-key": "google-secret",
      });
    }
  });
  it("queries custom endpoints with their own key and permits unauthenticated local servers", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        json({ data: [{ id: "local/model:latest" }] }),
      );
    await discoverModels(
      {
        provider: "custom",
        baseURL: "http://localhost:1234/v1/",
        apiKey: "custom-key",
      },
      () => {
        throw new Error("Should not read a saved key");
      },
      fetcher,
    );
    expect(fetcher).toHaveBeenLastCalledWith(
      "http://localhost:1234/v1/models",
      expect.objectContaining({
        headers: { Authorization: "Bearer custom-key" },
        redirect: "error",
      }),
    );
    await discoverModels(
      { provider: "custom", baseURL: "http://localhost:1234/v1" },
      () => undefined,
      fetcher,
    );
    expect(fetcher.mock.lastCall![1]?.headers).toEqual({});
  });
  it("falls back to the public catalogue without forwarding credentials", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ error: "Bearer private-key" }, 401))
      .mockResolvedValueOnce(
        json({
          anthropic: {
            models: {
              available: {
                id: "claude-chat",
                name: "Claude Chat",
                tool_call: true,
                modalities: { output: ["text"] },
              },
            },
          },
        }),
      );
    const result = await discoverModels(
      { provider: "anthropic" },
      () => "private-key",
      fetcher,
    );
    expect(result.source).toBe("catalog");
    expect(result.notice).not.toContain("private-key");
    expect(fetcher.mock.calls[1]![1]).not.toHaveProperty("headers");
  });
  it("returns a sanitized failure for unsupported or offline custom model lists", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ error: "private-key" }, 404));
    await expect(
      discoverModels(
        { provider: "custom", baseURL: "https://custom.example/v1" },
        () => "private-key",
        fetcher,
      ),
    ).rejects.toThrow("enter a model ID manually");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects unsafe endpoint formats before reading a key or making requests", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const credential = vi.fn();
    for (const baseURL of [
      "file:///tmp/models",
      "https://user:password@example.com/v1",
      "https://example.com/v1?key=secret",
      "https://example.com/v1#fragment",
    ]) {
      await expect(
        discoverModels({ provider: "custom", baseURL }, credential, fetcher),
      ).rejects.toThrow();
    }
    expect(fetcher).not.toHaveBeenCalled();
    expect(credential).not.toHaveBeenCalled();
  });
});

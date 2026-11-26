import { expect, it, vi } from "vitest";
import { runDecision, type DecisionRequest } from "./decisions";
import { decisionModels } from "../../shared/decisionModels";

const request: DecisionRequest = {
  input: "An order contains products through its line items.",
  questions: [
    {
      name: "valid",
      type: "predicate",
      instructions: "Does the input describe an order?",
    },
    {
      name: "path",
      type: "choice",
      instructions: "Which route relates an order to its products?",
      choices: [
        { value: "items", description: "Through order items" },
        { value: "promotions", description: "Through promotions" },
      ],
    },
    {
      name: "relevance",
      type: "score",
      instructions: "How relevant are products?",
      levels: [
        { label: "Low", description: "Unrelated" },
        { label: "High", description: "Directly relevant" },
      ],
    },
  ],
};
const commonAnswers = {
  valid: { type: "noul", noul: 0.99 },
  path: {
    type: "choice",
    choice: "items",
    probabilities: { items: 0.9, promotions: 0.1 },
    confidence: 0.8,
  },
  relevance: {
    type: "score",
    score: 0.9,
    probabilities: { "0": 0.1, "1": 0.9 },
    confidence: 0.8,
  },
};
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}
it.each(["openai", "google", "typesafe"] as const)(
  "adapts native %s requests and normalizes batched typed answers",
  async (provider) => {
    const answers =
      provider === "openai"
        ? [
            {
              name: "relevance",
              ...commonAnswers.relevance,
              probabilities: [
                { value: 0, probability: 0.1 },
                { value: 1, probability: 0.9 },
              ],
            },
            { name: "valid", type: "predicate", probability: 0.99 },
            {
              name: "path",
              ...commonAnswers.path,
              probabilities: [
                { value: "items", probability: 0.9 },
                { value: "promotions", probability: 0.1 },
              ],
            },
          ]
        : commonAnswers;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ answers }));
    const result = await runDecision(
      { provider, model: decisionModels[provider][0]!.id },
      "provider-secret",
      request,
      { fetcher },
    );
    expect(result).toEqual([
      { name: "valid", type: "predicate", probability: 0.99 },
      { name: "path", ...commonAnswers.path },
      { name: "relevance", ...commonAnswers.relevance },
    ]);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(
      {
        openai: "https://api.openai.com/v1/decisions",
        google: "https://generativelanguage.googleapis.com/v1beta/decisions",
        typesafe: "https://api.typesafe.ai/v1/systemone",
      }[provider],
    );
    expect(init?.redirect).toBe("error");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(init!.body as string);
    expect(body[provider === "typesafe" ? "state" : "input"]).toBe(
      request.input,
    );
    if (provider === "openai")
      expect(body.questions).toEqual(request.questions);
    else {
      expect(body.questions.path.criteria).toEqual({
        items: "Through order items",
        promotions: "Through promotions",
      });
      expect(body.questions.relevance.criteria).toEqual([
        "Low: Unrelated",
        "High: Directly relevant",
      ]);
      expect(body.questions.valid.type).toBe("noul");
    }
    expect(init?.headers).toMatchObject(
      provider === "google"
        ? { "x-goog-api-key": "provider-secret" }
        : { Authorization: "Bearer provider-secret" },
    );
  },
);
it.each([
  { ...commonAnswers, path: { ...commonAnswers.path, choice: "invented" } },
  {
    ...commonAnswers,
    path: { ...commonAnswers.path, probabilities: { items: 1 } },
  },
  { ...commonAnswers, valid: { type: "noul", noul: 2 } },
  { ...commonAnswers, relevance: { ...commonAnswers.relevance, score: 2 } },
  { ...commonAnswers, path: { type: "refusal" } },
  {},
])(
  "rejects invalid or incomplete responses without leaking provider contents",
  async (answers) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ answers }));
    await expect(
      runDecision(
        { provider: "typesafe", model: "jev-latest" },
        "secret",
        request,
        { fetcher },
      ),
    ).rejects.toThrow("Decision request failed");
  },
);
it("rejects unsupported models, missing keys and duplicate names before making requests", async () => {
  const fetcher = vi.fn<typeof fetch>();
  await expect(
    runDecision({ provider: "openai", model: "gpt-chat" }, "key", request, {
      fetcher,
    }),
  ).rejects.toThrow("Unsupported");
  await expect(
    runDecision(
      { provider: "openai", model: "gpt-6-luna" },
      undefined,
      request,
      { fetcher },
    ),
  ).rejects.toThrow("API key");
  await expect(
    runDecision(
      { provider: "openai", model: "gpt-6-luna" },
      "key",
      { ...request, questions: [request.questions[0]!, request.questions[0]!] },
      { fetcher },
    ),
  ).rejects.toThrow("unique");
  expect(fetcher).not.toHaveBeenCalled();
});
it("redacts HTTP errors and network failures", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(response({ error: "provider-secret" }, 401))
    .mockRejectedValueOnce(new Error("provider-secret"));
  for (let i = 0; i < 2; i++) {
    await expect(
      runDecision(
        { provider: "typesafe", model: "jev-latest" },
        "provider-secret",
        request,
        { fetcher },
      ),
    ).rejects.toThrow(
      /^Decision request failed\. Check the saved key, model access, billing, and network connection\.$/,
    );
  }
});

it.each(["clef", "clef-flash"])(
  "calls Cloudflare %s with its account-scoped endpoint and unwraps the response",
  async (model) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        response({
          success: true,
          result: { answers: commonAnswers },
          errors: [],
        }),
      );
    const result = await runDecision(
      { provider: "cloudflare", model: `@cf/cloudflare/${model}` },
      "cf-secret",
      request,
      { fetcher, accountId: "a".repeat(32) },
    );
    expect(result[1]).toMatchObject({ type: "choice", choice: "items" });
    expect(result[2]).toMatchObject({ type: "score", score: 0.9 });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${"a".repeat(32)}/ai/run/@cf/cloudflare/${model}`,
    );
    expect(init?.headers).toMatchObject({ Authorization: "Bearer cf-secret" });
    expect(init?.redirect).toBe("error");
    expect(JSON.parse(init!.body as string)).toMatchObject({
      model,
      state: request.input,
      questions: { valid: { type: "noul" } },
    });
  },
);
it("rejects invalid Cloudflare accounts and oversized batches before making requests", async () => {
  const fetcher = vi.fn<typeof fetch>();
  const selection = {
    provider: "cloudflare",
    model: "@cf/cloudflare/clef",
  } as const;
  for (const accountId of [
    undefined,
    "../other",
    "https://example.com",
    "not-an-account",
  ]) {
    await expect(
      runDecision(selection, "token", request, { fetcher, accountId }),
    ).rejects.toThrow();
  }
  await expect(
    runDecision(
      selection,
      "token",
      {
        ...request,
        questions: Array.from({ length: 65 }, (_, i) => ({
          name: `q${i}`,
          type: "predicate" as const,
          instructions: "Is it relevant?",
        })),
      },
      { fetcher, accountId: "a".repeat(32) },
    ),
  ).rejects.toThrow("at most 64");
  expect(fetcher).not.toHaveBeenCalled();
});
it("rejects unsuccessful Cloudflare envelopes even when HTTP succeeds", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      response({
        success: false,
        errors: [{ message: "cf-secret" }],
        result: { answers: commonAnswers },
      }),
    );
  await expect(
    runDecision(
      { provider: "cloudflare", model: "@cf/cloudflare/clef" },
      "cf-secret",
      request,
      { fetcher, accountId: "a".repeat(32) },
    ),
  ).rejects.toThrow(/^Decision request failed\./);
});

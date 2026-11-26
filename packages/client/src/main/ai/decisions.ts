import { z } from "zod";
import {
  decisionSelectionSchema,
  cloudflareAccountIdSchema,
  type DecisionSelection,
} from "../../shared/settings";
import { validDecisionModel } from "../../shared/decisionModels";

const text = z.string().trim().min(1).max(32_000);
const name = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/);
const questionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("predicate"), name, instructions: text }),
  z.object({
    type: z.literal("choice"),
    name,
    instructions: text,
    choices: z
      .array(z.object({ value: name, description: text }))
      .min(2)
      .max(255),
  }),
  z.object({
    type: z.literal("score"),
    name,
    instructions: text,
    levels: z
      .array(z.object({ label: text, description: text }))
      .min(2)
      .max(10),
  }),
]);
export const decisionRequestSchema = z
  .object({
    input: z.string().min(1).max(500_000),
    questions: z.array(questionSchema).min(1).max(400),
  })
  .superRefine((request, ctx) => {
    if (
      new Set(request.questions.map((q) => q.name)).size !==
      request.questions.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Question names must be unique.",
      });
    for (const q of request.questions) {
      if (
        q.type === "choice" &&
        new Set(q.choices.map((c) => c.value)).size !== q.choices.length
      )
        ctx.addIssue({
          code: "custom",
          message: "Choice values must be unique.",
        });
    }
  });
export type DecisionRequest = z.infer<typeof decisionRequestSchema>;
const probability = z.number().finite().min(0).max(1);
export type DecisionAnswer =
  | { type: "predicate"; name: string; probability: number }
  | {
      type: "choice";
      name: string;
      choice: string;
      probabilities: Record<string, number>;
      confidence: number;
    }
  | {
      type: "score";
      name: string;
      score: number;
      probabilities: Record<string, number>;
      confidence: number;
    };

const endpoints = {
  openai: "https://api.openai.com/v1/decisions",
  google: "https://generativelanguage.googleapis.com/v1beta/decisions",
  typesafe: "https://api.typesafe.ai/v1/systemone",
};

// Text-only common interface for native decision APIs. Provider-specific media
// features are deliberately outside the current schema-based use case.
export async function runDecision(
  selection: DecisionSelection,
  apiKey: string | undefined,
  value: DecisionRequest,
  options: {
    fetcher?: typeof fetch;
    signal?: AbortSignal;
    accountId?: string | undefined;
  } = {},
): Promise<DecisionAnswer[]> {
  const selected = decisionSelectionSchema.parse(selection);
  if (!validDecisionModel(selected))
    throw new Error("Unsupported decision model.");
  if (!apiKey?.trim())
    throw new Error(
      "Add a provider API key in Settings → AI before testing decisions.",
    );
  const request = decisionRequestSchema.parse(value);
  const cloudflare = selected.provider === "cloudflare";
  const accountId = cloudflare
    ? cloudflareAccountIdSchema.parse(options.accountId)
    : undefined;
  if (cloudflare && request.questions.length > 64)
    throw new Error(
      "Cloudflare supports at most 64 questions per decision request.",
    );
  const endpoint =
    selected.provider === "cloudflare"
      ? `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${selected.model}`
      : endpoints[selected.provider];
  const openai = selected.provider === "openai";
  const questions = openai
    ? request.questions
    : Object.fromEntries(
        request.questions.map((q) => [
          q.name,
          {
            type: q.type === "predicate" ? "noul" : q.type,
            instructions: q.instructions,
            ...(q.type === "choice"
              ? {
                  criteria: Object.fromEntries(
                    q.choices.map((c) => [c.value, c.description]),
                  ),
                }
              : {}),
            ...(q.type === "score"
              ? {
                  criteria: q.levels.map((l) => `${l.label}: ${l.description}`),
                }
              : {}),
          },
        ]),
      );
  try {
    const response = await (options.fetcher ?? fetch)(endpoint, {
      method: "POST",
      redirect: "error",
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(20_000)])
        : AbortSignal.timeout(20_000),
      headers: {
        "Content-Type": "application/json",
        ...(selected.provider === "google"
          ? { "x-goog-api-key": apiKey }
          : { Authorization: `Bearer ${apiKey}` }),
      },
      body: JSON.stringify({
        model: cloudflare
          ? selected.model.replace("@cf/cloudflare/", "")
          : selected.model,
        [selected.provider === "typesafe" || cloudflare ? "state" : "input"]:
          request.input,
        questions,
      }),
    });
    if (!response.ok) throw new Error("Provider request failed");
    const body: unknown = await response.json();
    const payload = cloudflare
      ? z.object({ success: z.literal(true), result: z.unknown() }).parse(body)
          .result
      : body;
    const raw = z.object({ answers: z.unknown() }).parse(payload);
    let answers: Record<string, unknown>;
    if (openai) {
      const items = z
        .array(z.object({ name: z.string() }).passthrough())
        .parse(raw.answers);
      if (new Set(items.map((a) => a.name)).size !== items.length)
        throw new Error("Duplicate answers");
      answers = Object.fromEntries(items.map((a) => [a.name, a]));
    } else answers = z.record(z.unknown()).parse(raw.answers);
    return request.questions.map((q): DecisionAnswer => {
      const answer = z
        .object({ type: z.string() })
        .passthrough()
        .parse(answers[q.name]);
      if (answer.type !== (q.type === "predicate" && !openai ? "noul" : q.type))
        throw new Error("Missing, refused, or mismatched answer");
      if (q.type === "predicate")
        return {
          type: "predicate",
          name: q.name,
          probability: probability.parse(
            answer[openai ? "probability" : "noul"],
          ),
        };
      const confidence = probability.parse(answer.confidence);
      let probabilities: Record<string, number>;
      if (openai) {
        const entries = z
          .array(
            z.object({ value: z.union([z.string(), z.number()]), probability }),
          )
          .parse(answer.probabilities);
        if (
          new Set(entries.map((p) => String(p.value))).size !== entries.length
        )
          throw new Error("Duplicate probabilities");
        probabilities = Object.fromEntries(
          entries.map((p) => [String(p.value), p.probability]),
        );
      } else probabilities = z.record(probability).parse(answer.probabilities);
      const expected =
        q.type === "choice"
          ? q.choices.map((c) => c.value)
          : q.levels.map((_, index) => String(index));
      if (
        Object.keys(probabilities).length !== expected.length ||
        expected.some(
          (key) => !Object.prototype.hasOwnProperty.call(probabilities, key),
        ) ||
        Math.abs(Object.values(probabilities).reduce((a, b) => a + b, 0) - 1) >
          0.02
      )
        throw new Error("Invalid probability distribution");
      if (q.type === "choice") {
        const choice = z.string().parse(answer.choice);
        if (!expected.includes(choice)) throw new Error("Unexpected choice");
        return {
          type: "choice",
          name: q.name,
          choice,
          probabilities,
          confidence,
        };
      }
      return {
        type: "score",
        name: q.name,
        score: z
          .number()
          .finite()
          .min(0)
          .max(q.levels.length - 1)
          .parse(answer.score),
        probabilities,
        confidence,
      };
    });
  } catch {
    // Never surface provider response bodies, request data, or credentials.
    throw new Error(
      "Decision request failed. Check the saved key, model access, billing, and network connection.",
    );
  }
}

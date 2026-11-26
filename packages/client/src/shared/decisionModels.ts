import type { Provider, ModelOption, DecisionSelection } from "./settings";

// Native decision endpoints verified 2026-11-13. Keep this separate from chat
// discovery: appearing in /models does not establish decision capability.
// https://developers.openai.com/api/docs/guides/decisions
// https://ai.google.dev/gemini-api/docs/decisions-api
// https://docs.typesafe.ai/models
// https://developers.cloudflare.com/workers-ai/models/clef/
export const decisionModels: Record<
  DecisionSelection["provider"],
  ModelOption[]
> = {
  openai: [{ id: "gpt-6-luna", name: "GPT-6 Luna" }],
  google: [{ id: "gemini-decision-1", name: "Gemini Decision 1" }],
  cloudflare: [
    { id: "@cf/cloudflare/clef", name: "Clef" },
    { id: "@cf/cloudflare/clef-flash", name: "Clef Flash" },
  ],
  typesafe: [
    { id: "jev-latest", name: "Jev latest" },
    { id: "jev-1.14.0", name: "Jev 1.14" },
    { id: "jev-1.13.0", name: "Jev 1.13" },
    { id: "jev-preview", name: "Jev preview" },
  ],
};
export function supportsDecisions(
  provider: Provider,
): provider is DecisionSelection["provider"] {
  return Object.prototype.hasOwnProperty.call(decisionModels, provider);
}
export function validDecisionModel(selection: DecisionSelection) {
  return selection.provider === "typesafe"
    ? /^jev-[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(selection.model)
    : decisionModels[selection.provider].some(
        (model) => model.id === selection.model,
      );
}

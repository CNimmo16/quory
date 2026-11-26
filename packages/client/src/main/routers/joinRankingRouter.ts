import { publicProcedure, router } from "../util/trpc";
import { settingsStore } from "../settings";
import { joinRankingRequestSchema } from "../../shared/joinRanking";
import { rankJoinCandidates } from "../ai/joinRanking";

export default router({
  rank: publicProcedure
    .input(joinRankingRequestSchema)
    .query(async ({ input, signal }) => {
      const fallback = {
        ranked: false,
        orderedIds: input.candidates.map(({ id }) => id),
      };
      try {
        const store = settingsStore();
        const ai = store.ai();
        if (!ai.decision || input.candidates.length < 2) return fallback;
        const key = store.credential(ai.decision.provider);
        if (!key) return fallback;
        return await rankJoinCandidates(input, ai.decision, key, {
          ...(signal ? { signal } : {}),
          accountId: ai.providers.cloudflare.accountId,
        });
      } catch {
        // Suggestions remain usable on provider, credential, or network failures.
        return fallback;
      }
    }),
});

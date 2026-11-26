import type { JoinRanker, JoinRankingRequest } from "../JoinRankingContext";
import type { JoinHop } from "./joinRouteOptions";

export type JoinTableCandidate = {
  id: string;
  distance: number;
  path: JoinHop[];
};

const tokens = (value: string) =>
  new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .map((word) => word.replace(/s$/, "")),
  );

/** Use only schema names and relationship metadata; never query/filter contents. */
export function shortlistJoinTables(
  candidates: JoinTableCandidate[],
  source: string,
  joinedTables: string[],
) {
  const context = tokens(
    [source, ...joinedTables]
      .map((ref) => ref.split(".").slice(1).join("."))
      .join(" "),
  );
  const scored = candidates.map((candidate) => {
    const words = tokens(candidate.id.split(".").slice(1).join("."));
    const overlap = [...words].filter((word) => context.has(word)).length;
    const confidence =
      candidate.path.reduce(
        (total, hop) => total + (hop.relationship.confidence ?? 1),
        0,
      ) / Math.max(1, candidate.path.length);
    return {
      candidate,
      score: overlap * 2 + confidence - candidate.distance * 0.75,
    };
  });
  return scored
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.candidate.distance - b.candidate.distance ||
        a.candidate.id.localeCompare(b.candidate.id),
    )
    .slice(0, 32)
    .map(({ candidate }) => ({
      id: candidate.id,
      description:
        `Table ${candidate.id}; distance ${candidate.distance}; relationships: ${candidate.path
          .map((hop) => {
            const relationship = hop.relationship;
            return `${relationship.localSchema}.${relationship.localTable} (${relationship.columnPairs.map((pair) => pair.localColumn).join(", ")}) -> ${relationship.foreignSchema}.${relationship.foreignTable} (${relationship.columnPairs.map((pair) => pair.foreignColumn).join(", ")}); source ${relationship.source ?? "schema"}; confidence ${relationship.confidence ?? "unspecified"}`;
          })
          .join("; ")}`.slice(0, 12_000),
    }));
}

/** Promote validated model IDs; keep all other reachable tables available. */
export function promoteJoinTables(allIds: string[], orderedIds: string[]) {
  const available = new Set(allIds);
  const promoted = [...new Set(orderedIds)].filter((id) => available.has(id));
  const selected = new Set(promoted);
  return [...promoted, ...allIds.filter((id) => !selected.has(id))];
}

/** One bounded attempt; late results cannot reorder an interactive picker. */
export async function rankJoinTables(
  ranker: JoinRanker,
  request: JoinRankingRequest,
  signal: AbortSignal,
  timeoutMs = 3000,
): Promise<string[]> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  const fallback = new Promise<string[]>((resolve) => {
    cancel = () => {
      controller.abort();
      resolve([]);
    };
    timer = setTimeout(cancel, timeoutMs);
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
  });
  try {
    const result = Promise.resolve()
      .then(() => {
        if (controller.signal.aborted) return [];
        return ranker(request, controller.signal).then((response) =>
          response.ranked
            ? promoteJoinTables(
                request.candidates.map(({ id }) => id),
                response.orderedIds,
              )
            : [],
        );
      })
      .catch(() => [] as string[]);
    return await Promise.race([result, fallback]);
  } finally {
    clearTimeout(timer);
    if (cancel) signal.removeEventListener("abort", cancel);
    controller.abort();
  }
}

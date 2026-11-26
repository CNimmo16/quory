import type { JoinGraph, JoinHop } from "./joinRouteOptions";
import type { JoinRankingResult } from "../JoinRankingContext";

export const MAX_PATH_CANDIDATES = 32;
const MAX_STATES = 256;
const MAX_EXPANSIONS = 8192;

/** Bounded breadth-first search with a reverse-distance feasibility check.
 * Keeps exact edge identities, including parallel constraints at every depth.
 */
export function shortlistJoinPaths(
  graph: JoinGraph,
  source: string,
  target: string,
  maxHops: number,
): JoinHop[][] {
  if (source === target || maxHops < 1) return [];
  const distance = new Map([[target, 0]]);
  const reverse = new Map<string, string[]>();
  for (const [from, neighbors] of graph)
    for (const to of neighbors.keys()) {
      const incoming = reverse.get(to) ?? [];
      incoming.push(from);
      reverse.set(to, incoming);
    }
  const queue = [target];
  for (let i = 0; i < queue.length; i++)
    for (const from of reverse.get(queue[i]!) ?? []) {
      if (!distance.has(from)) {
        distance.set(from, distance.get(queue[i]!)! + 1);
        queue.push(from);
      }
    }
  const shortest = distance.get(source);
  if (shortest === undefined || shortest > maxHops) return [];
  const limit = Math.min(Math.floor(maxHops), shortest + 2);
  let states: { from: string; path: JoinHop[]; visited: Set<string> }[] = [
    { from: source, path: [], visited: new Set([source]) },
  ];
  // Reserve one shortest route before the bounded exploration. This ensures
  // a valid suggestion even when a very wide frontier exhausts the work budget.
  const canonical: JoinHop[] = [];
  let current = source;
  while (current !== target) {
    const continuation = [...(graph.get(current) ?? [])]
      .filter(
        ([to, hops]) =>
          hops.length > 0 && distance.get(to) === distance.get(current)! - 1,
      )
      .sort(([a], [b]) => a.localeCompare(b))[0];
    if (!continuation) return [];
    const hop = [...continuation[1]].sort((a, b) =>
      JSON.stringify(a.step).localeCompare(JSON.stringify(b.step)),
    )[0]!;
    canonical.push(hop);
    current = continuation[0];
  }
  const paths: JoinHop[][] = [canonical];
  const seen = new Set<string>([
    JSON.stringify(canonical.map((hop) => hop.step)),
  ]);
  let expansions = 0;
  for (
    let depth = 0;
    depth < limit && states.length && paths.length < MAX_PATH_CANDIDATES;
    depth++
  ) {
    const next: typeof states = [];
    // Round-robin across parent states so a dense branch cannot consume the beam.
    const options = states.map((state) =>
      [...(graph.get(state.from) ?? [])]
        .sort(([a], [b]) => a.localeCompare(b))
        .flatMap(([to, hops]) =>
          state.visited.has(to) ||
          (distance.get(to) ?? Infinity) > limit - depth - 1
            ? []
            : [...hops]
                .sort((a, b) =>
                  JSON.stringify(a.step).localeCompare(JSON.stringify(b.step)),
                )
                .map((hop) => ({ to, hop })),
        ),
    );
    for (let index = 0; expansions < MAX_EXPANSIONS; index++) {
      let any = false;
      for (let s = 0; s < states.length && expansions < MAX_EXPANSIONS; s++) {
        const option = options[s]![index];
        if (!option) continue;
        any = true;
        expansions++;
        const state = states[s]!;
        const path = [...state.path, option.hop];
        if (option.to === target) {
          const id = JSON.stringify(path.map((hop) => hop.step));
          if (!seen.has(id)) {
            seen.add(id);
            paths.push(path);
          }
          if (paths.length === MAX_PATH_CANDIDATES) return paths;
        } else if (next.length < MAX_STATES)
          next.push({
            from: option.to,
            path,
            visited: new Set([...state.visited, option.to]),
          });
      }
      if (!any) break;
    }
    states = next;
  }
  return paths;
}

export function describeJoinPath(source: string, path: JoinHop[]): string {
  let from = source;
  return path
    .map((hop) => {
      const columns = hop.relationship.columnPairs
        .map(
          (pair) =>
            `${hop.forward ? pair.localColumn : pair.foreignColumn} -> ${hop.forward ? pair.foreignColumn : pair.localColumn}`,
        )
        .join(", ");
      const description = `${from} -> ${hop.step.tableRef}; constraint ${hop.relationship.constraintId}; ${hop.forward ? "forward" : "reverse"}; origin ${hop.relationship.source ?? "unspecified"}; columns ${columns}`;
      from = hop.step.tableRef;
      return description;
    })
    .join("\n")
    .slice(0, 12000);
}

/** A malformed response never changes the deterministic local order. */
export function orderJoinPathIds(
  ids: string[],
  result?: JoinRankingResult,
): string[] {
  if (
    !result?.ranked ||
    !Array.isArray(result.orderedIds) ||
    result.orderedIds.length !== ids.length ||
    new Set(result.orderedIds).size !== ids.length ||
    result.orderedIds.some((id) => !ids.includes(id))
  )
    return ids.slice(0, 3);
  return result.orderedIds.slice(0, 3);
}

import {
  describeJoinPath,
  orderJoinPathIds,
  shortlistJoinPaths,
} from "./joinPathSuggestions";
import type { JoinGraph, JoinHop } from "./joinRouteOptions";

function edge(
  from: string,
  to: string,
  constraintId = `${from}_${to}`,
): JoinHop {
  return {
    forward: true,
    step: { tableRef: to, usingConstraintId: constraintId },
    relationship: {
      constraintId,
      localSchema: "public",
      localTable: from,
      foreignSchema: "public",
      foreignTable: to,
      columnPairs: [{ localColumn: `${constraintId}_id`, foreignColumn: "id" }],
    },
  };
}
function graph(edges: [string, string, string?][]): JoinGraph {
  const result: JoinGraph = new Map();
  for (const [from, to, id] of edges) {
    const neighbors = result.get(from) ?? new Map<string, JoinHop[]>();
    neighbors.set(to, [...(neighbors.get(to) ?? []), edge(from, to, id)]);
    result.set(from, neighbors);
  }
  return result;
}

describe("exact join path shortlist", () => {
  it("retains equal length routes and parallel constraints beyond the first edge", () => {
    const paths = shortlistJoinPaths(
      graph([
        ["a", "b"],
        ["b", "d", "owner"],
        ["b", "d", "reviewer"],
        ["a", "c"],
        ["c", "d"],
      ]),
      "a",
      "d",
      3,
    );
    expect(paths).toHaveLength(3);
    expect(
      paths
        .filter((path) => path[0]!.step.tableRef === "b")
        .map((path) => path[1]!.step.usingConstraintId),
    ).toEqual(["owner", "reviewer"]);
  });
  it("includes slightly longer alternatives while enforcing hop limits and avoiding loops", () => {
    const g = graph([
      ["a", "d"],
      ["a", "b"],
      ["b", "a"],
      ["b", "c"],
      ["c", "d"],
    ]);
    expect(
      shortlistJoinPaths(g, "a", "d", 3).map((path) => path.length),
    ).toEqual([1, 3]);
    expect(
      shortlistJoinPaths(g, "a", "d", 2).map((path) => path.length),
    ).toEqual([1]);
    expect(shortlistJoinPaths(g, "a", "d", 0)).toEqual([]);
  });
  it("bounds dense cyclic graphs and produces deterministic exact candidates", () => {
    const edges: [string, string][] = [];
    for (let a = 0; a < 45; a++)
      for (let b = 0; b < 45; b++)
        if (a !== b) edges.push([String(a), String(b)]);
    const g = graph(edges);
    const paths = shortlistJoinPaths(g, "0", "44", 44);
    expect(paths).toHaveLength(32);
    expect(shortlistJoinPaths(g, "0", "44", 44)).toEqual(paths);
    for (const path of paths)
      expect(new Set(["0", ...path.map((h) => h.step.tableRef)]).size).toBe(
        path.length + 1,
      );
  });
  it("describes directional column metadata", () => {
    const hop = edge("a", "b", "owner");
    hop.forward = false;
    expect(describeJoinPath("a", [hop])).toContain("columns id -> owner_id");
  });
});

describe("path ranking validation", () => {
  const ids = ["a", "b", "c", "d"];
  it("selects only the top three supplied paths", () =>
    expect(
      orderJoinPathIds(ids, { ranked: true, orderedIds: ["d", "b", "a", "c"] }),
    ).toEqual(["d", "b", "a"]));
  it.each([
    undefined,
    { ranked: false, orderedIds: ["d", "b", "a", "c"] },
    { ranked: true, orderedIds: ["invented", "b", "a", "c"] },
    { ranked: true, orderedIds: ["b", "b", "a", "c"] },
    { ranked: true, orderedIds: ["b"] },
  ])(
    "falls back deterministically for disabled or malformed rankings %j",
    (result) => expect(orderJoinPathIds(ids, result)).toEqual(["a", "b", "c"]),
  );
});

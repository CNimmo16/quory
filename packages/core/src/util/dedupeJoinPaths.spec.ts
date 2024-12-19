import dedupeJoinPaths from "./dedupeJoinPaths";

describe("dedupeJoinPaths", () => {
  it("correctly dedupes", async () => {
    const joinPaths = [
      {
        tableRef: "a",
        path: ["a", "b", "c"],
      },
      {
        tableRef: "b",
        path: ["a", "b"],
      },
      {
        tableRef: "c",
        path: ["a", "b", "c", "d", "e"],
      },
    ];
    expect(dedupeJoinPaths(joinPaths)).toEqual([
      {
        path: ["a", "b", "c", "d", "e"],
        tableRefs: ["a", "b", "c"],
      },
    ]);
  });

  it("doesnt dedupe when subset doesnt start at zero index", async () => {
    const joinPaths = [
      {
        tableRef: "a",
        path: ["a", "b", "c", "d"],
      },
      {
        tableRef: "b",
        path: ["b", "c", "d"],
      },
    ];
    expect(dedupeJoinPaths(joinPaths)).toEqual([
      {
        tableRefs: ["a"],
        path: ["a", "b", "c", "d"],
      },
      {
        tableRefs: ["b"],
        path: ["b", "c", "d"],
      },
    ]);
  });
});

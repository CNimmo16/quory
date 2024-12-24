import groupByPath from "./groupByPath";

describe("groupByPath", () => {
  it("correctly dedupes", async () => {
    const joinPaths = [
      {
        item: 1,
        path: ["a", "b", "c"],
      },
      {
        item: 2,
        path: ["a", "b"],
      },
      {
        item: 3,
        path: ["a", "b", "c", "d", "e"],
      },
    ];
    expect(groupByPath(joinPaths)).toEqual([
      {
        path: ["a", "b", "c", "d", "e"],
        items: [1, 2, 3],
      },
    ]);
  });

  it("supports same item in path twice", async () => {
    const joinPaths = [
      {
        item: "a",
        path: ["a"],
      },
      {
        item: "a",
        path: ["a", "b", "a"],
      },
    ];
    expect(groupByPath(joinPaths)).toEqual([
      {
        path: ["a", "b", "a"],
        items: ["a", "a"],
      },
    ]);
  });

  it("doesnt dedupe when subset doesnt start at zero index", async () => {
    const joinPaths = [
      {
        item: 1,
        path: ["a", "b", "c", "d"],
      },
      {
        item: 2,
        path: ["b", "c", "d"],
      },
    ];
    expect(groupByPath(joinPaths)).toEqual([
      {
        items: [1],
        path: ["a", "b", "c", "d"],
      },
      {
        items: [2],
        path: ["b", "c", "d"],
      },
    ]);
  });
});

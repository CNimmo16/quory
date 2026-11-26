import {
  promoteJoinTables,
  rankJoinTables,
  shortlistJoinTables,
  type JoinTableCandidate,
} from "./joinTableRanking";
import type { JoinRankingRequest } from "../JoinRankingContext";

const candidate = (id: string, distance = 1): JoinTableCandidate => ({
  id,
  distance,
  path: [],
});
const request: JoinRankingRequest = {
  kind: "tables",
  sourceTable: "public.users",
  joinedTables: ["public.users"],
  candidates: [
    { id: "public.orders", description: "schema metadata" },
    { id: "public.products", description: "schema metadata" },
  ],
};

describe("join table ranking", () => {
  it("shortlists at most 32 deterministically and considers semantic affinity alongside distance", () => {
    const input = Array.from({ length: 60 }, (_, i) =>
      candidate(`public.table_${i}`, 1),
    );
    input.push(candidate("public.user_profiles", 2));
    const result = shortlistJoinTables(input, "public.users", []);
    expect(result).toHaveLength(32);
    expect(result[0]?.id).toBe("public.user_profiles");
    expect(
      shortlistJoinTables([...input].reverse(), "public.users", []),
    ).toEqual(result);
    expect(
      result.every(({ description }) => description.includes("distance")),
    ).toBe(true);
  });

  it("bounds schema descriptions", () => {
    expect(
      shortlistJoinTables(
        [candidate("public." + "x".repeat(14000))],
        "public.users",
        [],
      )[0]!.description,
    ).toHaveLength(12000);
  });

  it("promotes known unique IDs while retaining the complete searchable universe", () => {
    expect(
      promoteJoinTables(["a", "b", "c", "d"], ["c", "unknown", "c", "a"]),
    ).toEqual(["c", "a", "b", "d"]);
  });

  it("validates model IDs against the shortlist and appends omitted candidates", async () => {
    const result = await rankJoinTables(
      async () => ({
        ranked: true,
        orderedIds: ["unknown", "public.products", "public.products"],
      }),
      request,
      new AbortController().signal,
    );
    expect(result).toEqual(["public.products", "public.orders"]);
  });

  it("uses local order for unavailable or failing rankers", async () => {
    expect(
      await rankJoinTables(
        async () => ({ ranked: false, orderedIds: ["public.products"] }),
        request,
        new AbortController().signal,
      ),
    ).toEqual([]);
    expect(
      await rankJoinTables(
        async () => {
          throw new Error("offline");
        },
        request,
        new AbortController().signal,
      ),
    ).toEqual([]);
  });

  it("falls back on a deadline and aborts the outstanding request", async () => {
    let signal: AbortSignal | undefined;
    const result = await rankJoinTables(
      async (_, received) => {
        signal = received;
        return new Promise(() => {});
      },
      request,
      new AbortController().signal,
      5,
    );
    expect(result).toEqual([]);
    expect(signal?.aborted).toBe(true);
  });

  it("ignores aborted contexts even when the ranker resolves later", async () => {
    const controller = new AbortController();
    let resolve!: (value: { ranked: boolean; orderedIds: string[] }) => void;
    const ranking = rankJoinTables(
      () =>
        new Promise((complete) => {
          resolve = complete;
        }),
      request,
      controller.signal,
    );
    await Promise.resolve();
    controller.abort();
    expect(await ranking).toEqual([]);
    resolve({ ranked: true, orderedIds: ["public.products"] });
  });
});

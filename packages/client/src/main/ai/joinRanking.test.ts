import { expect, it, vi } from "vitest";
import { rankJoinCandidates } from "./joinRanking";
import type { JoinRankingRequest } from "../../shared/joinRanking";

const request: JoinRankingRequest = {
  kind: "paths",
  sourceTable: "main.orders",
  targetTable: "main.products",
  joinedTables: ["main.orders"],
  candidates: [
    { id: "route-a", description: "orders → promotions → products" },
    { id: "route-b", description: "orders → order_items → products" },
    { id: "route-c", description: "orders → catalog → products" },
  ],
};

it("ranks only supplied candidates by model score and retains local tie order", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(
      JSON.stringify({
        answers: Object.fromEntries(
          [1, 4, 4].map((score, index) => [
            `candidate_${index}`,
            {
              type: "score",
              score,
              confidence: 1,
              probabilities: Object.fromEntries(
                [0, 1, 2, 3, 4].map((level) => [
                  String(level),
                  level === score ? 1 : 0,
                ]),
              ),
            },
          ]),
        ),
      }),
    ),
  );
  const result = await rankJoinCandidates(
    request,
    { provider: "typesafe", model: "jev-latest" },
    "test-key",
    { fetcher },
  );
  expect(result).toEqual({
    ranked: true,
    orderedIds: ["route-b", "route-c", "route-a"],
  });
  const body = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
  expect(Object.keys(body.questions)).toHaveLength(3);
  expect(body.questions.candidate_0.criteria).toHaveLength(5);
  expect(JSON.parse(body.state)).toMatchObject({
    sourceTable: "main.orders",
    targetTable: "main.products",
    joinedTables: ["main.orders"],
  });
  expect(body.state).not.toContain("test-key");
});

it("rejects incomplete model results instead of dropping unscored candidates", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(JSON.stringify({ answers: {} })));
  await expect(
    rankJoinCandidates(
      request,
      { provider: "typesafe", model: "jev-latest" },
      "test-key",
      { fetcher },
    ),
  ).rejects.toThrow();
});

it("asks native predicates for columns and returns only positively selected candidates", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(
      JSON.stringify({
        answers: {
          candidate_0: { type: "noul", noul: 0.1 },
          candidate_1: { type: "noul", noul: 0.95 },
          candidate_2: { type: "noul", noul: 0.8 },
        },
      }),
    ),
  );
  const result = await rankJoinCandidates(
    {
      ...request,
      kind: "columns",
      targetTable: "main.products",
      selectedColumns: [{ tableRef: "main.orders", columns: ["total"] }],
      joinPath: "orders -> order_items -> products",
      candidates: ["internal_id", "name", "price"].map((id) => ({
        id,
        description: id,
      })),
    },
    { provider: "typesafe", model: "jev-latest" },
    "test-key",
    { fetcher },
  );
  expect(result).toEqual({
    ranked: true,
    orderedIds: ["internal_id", "name", "price"],
    selectedIds: ["name", "price"],
  });
  const body = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
  expect(body.questions.candidate_0.type).toBe("noul");
  expect(JSON.parse(body.state)).toMatchObject({
    selectedColumns: [{ tableRef: "main.orders", columns: ["total"] }],
    joinPath: "orders -> order_items -> products",
  });
});

it("uses starting-table instructions when selecting initial columns for a single table", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(
      JSON.stringify({
        answers: {
          candidate_0: { type: "noul", noul: 0.9 },
          candidate_1: { type: "noul", noul: 0.2 },
        },
      }),
    ),
  );
  const result = await rankJoinCandidates(
    {
      kind: "columns",
      sourceTable: "public.orders",
      targetTable: "public.orders",
      joinedTables: ["public.orders"],
      selectedColumns: [],
      candidates: ["order_number", "payload"].map((id) => ({
        id,
        description: id,
      })),
    },
    { provider: "typesafe", model: "jev-latest" },
    "test-key",
    { fetcher },
  );
  expect(result).toEqual({
    ranked: true,
    orderedIds: ["order_number", "payload"],
    selectedIds: ["order_number"],
  });
  const body = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
  expect(JSON.parse(body.state).task).toContain("starting table");
  expect(body.questions.candidate_0.instructions).toContain("starting table");
});

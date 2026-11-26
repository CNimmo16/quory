import { beforeEach, expect, it, vi } from "vitest";
import type { DecisionSelection } from "../../shared/settings";

const mocks = vi.hoisted(() => ({
  selection: vi.fn<() => DecisionSelection | null>(),
  credential: vi.fn<() => string | undefined>(),
  rank: vi.fn(),
}));
vi.mock("../settings", () => ({
  settingsStore: () => ({
    ai: () => ({
      decision: mocks.selection(),
      providers: { cloudflare: { accountId: "a".repeat(32) } },
    }),
    credential: mocks.credential,
  }),
}));
vi.mock("../ai/joinRanking", () => ({ rankJoinCandidates: mocks.rank }));
import router from "./joinRankingRouter";
const caller = router.createCaller({});
const input = {
  kind: "tables" as const,
  sourceTable: "main.orders",
  joinedTables: ["main.orders"],
  candidates: [
    { id: "people", description: "orders.buyer_id → people.id" },
    { id: "items", description: "orders.id ← items.order_id" },
  ],
};
const fallback = { ranked: false, orderedIds: ["people", "items"] };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.selection.mockReturnValue({
    provider: "cloudflare",
    model: "@cf/cloudflare/clef",
  });
  mocks.credential.mockReturnValue("saved-test-secret");
  mocks.rank.mockResolvedValue({
    ranked: true,
    orderedIds: ["items", "people"],
  });
});

it("uses saved decision selection and credentials, forwarding only validated metadata", async () => {
  expect(
    await caller.rank({
      ...input,
      apiKey: "untrusted",
      sql: "SELECT secret",
    } as typeof input),
  ).toEqual({ ranked: true, orderedIds: ["items", "people"] });
  expect(mocks.credential).toHaveBeenCalledWith("cloudflare");
  expect(mocks.rank).toHaveBeenCalledWith(
    input,
    { provider: "cloudflare", model: "@cf/cloudflare/clef" },
    "saved-test-secret",
    expect.objectContaining({ accountId: "a".repeat(32) }),
  );
});

it("uses local order without making a request when decisions are disabled", async () => {
  mocks.selection.mockReturnValue(null);
  expect(await caller.rank(input)).toEqual(fallback);
  expect(mocks.rank).not.toHaveBeenCalled();
});

it("uses local order when credentials are missing or a provider fails", async () => {
  mocks.credential.mockReturnValue(undefined);
  expect(await caller.rank(input)).toEqual(fallback);
  expect(mocks.rank).not.toHaveBeenCalled();
  mocks.credential.mockReturnValue("saved-test-secret");
  mocks.rank.mockRejectedValue(
    new Error("provider response containing secret"),
  );
  expect(await caller.rank(input)).toEqual(fallback);
});

it("does not spend a decision request on a single candidate", async () => {
  expect(
    await caller.rank({ ...input, candidates: input.candidates.slice(0, 1) }),
  ).toEqual({ ranked: false, orderedIds: ["people"] });
  expect(mocks.rank).not.toHaveBeenCalled();
});

it("rejects unbounded or ambiguous candidate sets and missing path destinations", async () => {
  for (const candidates of [
    [],
    Array.from({ length: 33 }, (_, index) => ({
      id: `c${index}`,
      description: "candidate",
    })),
    [input.candidates[0], input.candidates[0]],
  ]) {
    await expect(
      caller.rank({
        ...input,
        candidates: candidates as typeof input.candidates,
      }),
    ).rejects.toThrow();
  }
  await expect(caller.rank({ ...input, kind: "paths" })).rejects.toThrow();
  await expect(caller.rank({ ...input, kind: "columns" })).rejects.toThrow();
  expect(mocks.rank).not.toHaveBeenCalled();
});

it("forwards bounded column context and returns the selected subset", async () => {
  const columnInput = {
    ...input,
    kind: "columns" as const,
    targetTable: "main.people",
    selectedColumns: [{ tableRef: "main.orders", columns: ["total"] }],
    joinPath: "orders.buyer_id -> people.id",
    candidates: ["id", "name"].map((id) => ({ id, description: id })),
  };
  const result = {
    ranked: true,
    orderedIds: ["id", "name"],
    selectedIds: ["name"],
  };
  mocks.rank.mockResolvedValue(result);
  expect(await caller.rank(columnInput)).toEqual(result);
  expect(mocks.rank.mock.calls[0]![0]).toEqual(columnInput);
  await expect(
    caller.rank({
      ...columnInput,
      selectedColumns: [
        {
          tableRef: "main.orders",
          columns: Array.from({ length: 33 }, (_, i) => `field${i}`),
        },
      ],
    }),
  ).rejects.toThrow();
});

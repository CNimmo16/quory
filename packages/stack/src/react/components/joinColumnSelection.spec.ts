import type { DatabaseTableInfo } from "@quory/core";
import type {
  JoinRankingRequest,
  JoinRankingResult,
} from "../JoinRankingContext";
import { selectJoinColumns, shortlistJoinColumns } from "./joinColumnSelection";

const request: JoinRankingRequest = {
  kind: "columns",
  sourceTable: "main.orders",
  targetTable: "main.people",
  joinedTables: ["main.orders"],
  candidates: ["id", "name", "email"].map((id) => ({ id, description: id })),
};
const schemaOrder = ["id", "name", "email"];
const fallback = ["id", "name"];
const select = (result: JoinRankingResult) =>
  selectJoinColumns(
    async () => result,
    request,
    fallback,
    schemaOrder,
    new AbortController().signal,
  );

it("uses only model-selected columns in schema order", async () => {
  expect(
    await select({
      ranked: true,
      orderedIds: [],
      selectedIds: ["email", "name"],
    }),
  ).toEqual(["name", "email"]);
});

it.each([
  { ranked: false, orderedIds: [] },
  { ranked: true, orderedIds: [] },
  { ranked: true, orderedIds: [], selectedIds: [] },
  { ranked: true, orderedIds: [], selectedIds: ["invented"] },
  { ranked: true, orderedIds: [], selectedIds: ["id", "id"] },
])(
  "uses a useful nonempty fallback for invalid or unavailable decisions: %j",
  async (result) => {
    expect(await select(result)).toEqual(fallback);
  },
);

it("falls back after three seconds and ignores a late response", async () => {
  jest.useFakeTimers();
  try {
    let resolve!: (value: JoinRankingResult) => void;
    let modelSignal: AbortSignal | undefined;
    const promise = selectJoinColumns(
      (_request, signal) => {
        modelSignal = signal;
        return new Promise((done) => {
          resolve = done;
        });
      },
      request,
      fallback,
      schemaOrder,
      new AbortController().signal,
    );
    await Promise.resolve();
    jest.advanceTimersByTime(3000);
    expect(await promise).toEqual(fallback);
    expect(modelSignal?.aborted).toBe(true);
    resolve({ ranked: true, orderedIds: [], selectedIds: ["email"] });
    expect(await promise).toEqual(fallback);
  } finally {
    jest.useRealTimers();
  }
});

it("stops immediately when canceled and handles provider failure", async () => {
  const controller = new AbortController();
  const promise = selectJoinColumns(
    () => new Promise(() => {}),
    request,
    fallback,
    schemaOrder,
    controller.signal,
  );
  controller.abort();
  expect(await promise).toEqual(fallback);
  expect(
    await selectJoinColumns(
      async () => {
        throw new Error("offline");
      },
      request,
      fallback,
      schemaOrder,
      new AbortController().signal,
    ),
  ).toEqual(fallback);
});

it("bounds wide schemas and prefers useful fields over large payloads and redundant keys", () => {
  const names = [
    ...Array.from({ length: 50 }, (_, i) => `payload_${i}`),
    "id",
    "name",
    "email",
    "status",
    "password_hash",
    "customer_id",
  ];
  const table: DatabaseTableInfo = {
    name: "people",
    columns: names.map((name) => ({
      name,
      dataType: "text",
      genericDataType: name.startsWith("payload") ? "hierarchical" : "text",
      isNullable: false,
      includedInPrimaryKey: name === "id",
      foreignKeys: [],
      foreignKeyReferences: [],
    })),
  };
  const result = shortlistJoinColumns(table, []);
  expect(result.candidates).toHaveLength(32);
  expect(result.fallback).toEqual([
    "id",
    "name",
    "email",
    "status",
    "customer_id",
  ]);
  expect(result.candidates.map(({ id }) => id)).toContain("email");
});

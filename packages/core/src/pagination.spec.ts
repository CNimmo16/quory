import { expect, it, vi } from "vitest";
import sqlite from "better-sqlite3";
import {
  areQueriesEqual,
  prepareQuery,
  runQuery,
  getCountForQuery,
  type Query,
  type DatabaseSchema,
  type DatabaseDriver,
} from ".";
import executeQuery from "./executeQuery";

const schemas: DatabaseSchema[] = [
  {
    name: "main",
    tables: [
      {
        name: "items",
        columns: [
          {
            name: "id",
            dataType: "integer",
            genericDataType: "number",
            isNullable: false,
            includedInPrimaryKey: true,
            foreignKeys: [],
            foreignKeyReferences: [],
          },
        ],
      },
    ],
  },
];
const query: Query = {
  base: {
    tableRef: "main.items",
    select: "*",
    orderBy: [{ column: "id", direction: "asc" }],
  },
};
const mock = (): DatabaseDriver => ({
  dialect: "sqlite",
  exec: vi.fn().mockResolvedValue([]),
  testConnection: vi.fn(),
  teardown: vi.fn().mockResolvedValue(undefined),
  getAllColumnsInDatabase: vi.fn(),
  getAllForeignKeysInDatabase: vi.fn(),
});

it.each([
  0,
  -1,
  101,
  1000,
  1.5,
  NaN,
  Infinity,
  Number.MAX_SAFE_INTEGER + 1,
  "10",
  null,
])("rejects limit %s before executing", async (limit) => {
  const driver = mock();
  await expect(
    runQuery(driver, schemas, { ...query, limit } as Query),
  ).rejects.toThrow("limit");
  await expect(
    getCountForQuery(driver, schemas, { ...query, limit } as Query),
  ).rejects.toThrow("limit");
  expect(driver.exec).not.toHaveBeenCalled();
});
it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "0", null])(
  "rejects offset %s",
  async (offset) => {
    const driver = mock();
    await expect(
      runQuery(driver, schemas, { ...query, offset } as Query),
    ).rejects.toThrow("offset");
    expect(driver.exec).not.toHaveBeenCalled();
  },
);
it("caps omitted limits, preserves prepared pages, and counts all matching rows", async () => {
  const db = sqlite(":memory:");
  try {
    db.exec(
      "CREATE TABLE items (id INTEGER PRIMARY KEY); WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<205) INSERT INTO items SELECT x FROM n",
    );
    const driver: DatabaseDriver = {
      ...mock(),
      exec: async (sql, values = []) => db.prepare(sql).all(...values) as never,
    };
    expect((await runQuery(driver, schemas, query)).rows).toHaveLength(100);
    const page = { ...query, offset: 100 };
    const prepared = (await prepareQuery(schemas, page)).preparedQuery;
    expect(prepared).toMatchObject({ limit: 100, offset: 100 });
    const second = await runQuery(driver, schemas, prepared);
    expect(second.rows).toHaveLength(100);
    expect(second.rows[0]![0]!.data.id).toBe(101);
    expect(
      (await runQuery(driver, schemas, { ...page, offset: 200 })).rows,
    ).toHaveLength(5);
    expect(
      (await runQuery(driver, schemas, { ...page, offset: 205 })).rows,
    ).toHaveLength(0);
    expect(
      (await getCountForQuery(driver, schemas, { ...page, limit: 1 })).count,
    ).toBe(205);
    const total = await getCountForQuery(driver, schemas, prepared);
    expect(total.meta.preparedQuery).toMatchObject({
      limit: 100,
      offset: 100,
      base: { orderBy: query.base.orderBy },
    });
    expect(areQueriesEqual(schemas, page, prepared)).toBe(true);
    expect(areQueriesEqual(schemas, query, page)).toBe(false);
    expect(areQueriesEqual(schemas, query, { ...query, limit: 1 })).toBe(false);
  } finally {
    db.close();
  }
});
it("deadlines abort driver execution and pre-aborted requests never execute", async () => {
  const driver = mock();
  let signal: AbortSignal | undefined;
  driver.exec = vi.fn((_sql, _values, options) => {
    signal = options?.signal;
    return new Promise<never>(() => {});
  });
  await expect(
    executeQuery(driver, "SELECT 1", [], { timeoutMs: 5 }),
  ).rejects.toThrow("timed out");
  expect(signal?.aborted).toBe(true);
  const controller = new AbortController();
  controller.abort(new Error("cancelled"));
  await expect(
    executeQuery(driver, "SELECT 1", [], { signal: controller.signal }),
  ).rejects.toThrow("cancelled");
  expect(driver.exec).toHaveBeenCalledTimes(1);
});

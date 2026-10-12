import { describe, expect, it, vi } from "vitest";
import {
  ConditionOperator,
  prepareQuery,
  runQuery,
  type DatabaseDriver,
  type Query,
} from "@quory/core";
import { schemas, orderQuery } from "../../../test/queryFixtures";
import { queryFromTool, validateAssistantQuery } from "./queryTool";
import routes from "../../../../stack/src/server/routes";

const payload = "\\' OR 1=1; --\0雪";
function database() {
  const driver: DatabaseDriver = {
    dialect: "postgres",
    exec: vi.fn().mockResolvedValue([{ count: 1 }]),
    getAllColumnsInDatabase: vi.fn(),
    getAllForeignKeysInDatabase: vi.fn(),
    testConnection: vi.fn(),
  };
  return { driver, schemas };
}
const simple: Query = { base: { tableRef: "public.users", select: "*" } };

describe("shared entry-path validation", () => {
  it("rejects the demonstrated sort injection through manual, HTTP data/count and AI", async () => {
    const query = structuredClone(simple);
    query.base.orderBy = [{ column: "id, (SELECT 123)", direction: "asc" }];
    const db = database();
    await expect(runQuery(db.driver, schemas, query)).rejects.toThrow("column");
    await expect(
      routes.query.handle({ database: db }, { query })
    ).rejects.toThrow("column");
    await expect(
      routes.queryCount.handle({ database: db }, { query })
    ).rejects.toThrow("column");
    const tool = structuredClone(orderQuery);
    tool.tables[0]!.orderBy[0]!.column = "id, (SELECT 123)";
    await expect(
      validateAssistantQuery(schemas, queryFromTool(tool))
    ).rejects.toThrow("column");
    expect(db.driver.exec).not.toHaveBeenCalled();
  });

  it("binds the same exact filter values through manual, HTTP and AI queries", async () => {
    const query = structuredClone(simple);
    query.base.where = {
      column: "email",
      operator: ConditionOperator.EQUALS,
      value: payload,
    };
    const manual = database();
    await runQuery(manual.driver, schemas, query);
    const http = database();
    await routes.query.handle({ database: http }, { query });
    const ai = database();
    await validateAssistantQuery(schemas, query);
    await runQuery(ai.driver, schemas, query);
    for (const db of [manual, http, ai]) {
      const [sql, values] = vi.mocked(db.driver.exec).mock.calls[0]!;
      expect(sql).not.toContain(payload);
      expect(sql).toContain('"email" = $1');
      expect(values).toEqual([payload, 100, 0]);
    }
    expect(http.driver.exec).toHaveBeenCalledTimes(1);
  });

  it("accepts metadata identifiers containing quotes and spaces through AI and HTTP", async () => {
    const unusual = structuredClone(schemas);
    unusual[0]!.tables[3]!.name = 'Order "History"';
    unusual[0]!.tables[3]!.columns[1]!.name = 'message " text';
    const query: Query = {
      base: {
        tableRef: 'public.Order "History"',
        select: ['message " text'],
        orderBy: [{ column: 'message " text', direction: "desc" }],
      },
    };
    await expect(
      validateAssistantQuery(unusual, query)
    ).resolves.toBeUndefined();
    const db = { ...database(), schemas: unusual };
    await routes.query.handle({ database: db }, { query });
    expect(db.driver.exec).toHaveBeenCalledWith(
      expect.stringContaining('"message "" text" DESC'),
      [100, 0],
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });
});

it("accepts prepared queries resubmitted by the editor through HTTP", async () => {
  const { preparedQuery } = await prepareQuery(schemas, simple);
  const db = database();
  await expect(
    routes.query.handle({ database: db }, { query: preparedQuery })
  ).resolves.toBeDefined();
  expect(db.driver.exec).toHaveBeenCalledTimes(1);
});

it.each([
  { limit: 101 },
  { limit: 1000 },
  { limit: 0 },
  { limit: 1.5 },
  { limit: Number.MAX_SAFE_INTEGER + 1 },
  { limit: "100" },
  { offset: -1 },
  { offset: 0.5 },
  { offset: Infinity },
  { offset: Number.MAX_SAFE_INTEGER + 1 },
  { offset: "0" },
])(
  "rejects malformed pagination at HTTP, persistence, AI and core boundaries: %s",
  async (pagination) => {
    const query = { ...simple, ...pagination } as Query;
    const db = database();
    await expect(runQuery(db.driver, schemas, query)).rejects.toThrow();
    await expect(validateAssistantQuery(schemas, query)).rejects.toThrow();
    await expect(
      routes.query.handle({ database: db }, { query })
    ).rejects.toThrow();
    await expect(
      routes.queryCount.handle({ database: db }, { query })
    ).rejects.toThrow();
    const { query: savedQueryValidator } = await import(
      "../../../../stack/src/server/validators"
    );
    expect(savedQueryValidator.safeParse(query).success).toBe(false);
    const { upsertQuerySchema } = await import("./queryTool");
    expect(
      upsertQuerySchema.safeParse({ ...orderQuery, ...pagination }).success
    ).toBe(false);
    expect(db.driver.exec).not.toHaveBeenCalled();
  }
);

it("keeps counts lazy, binds offset, and preserves pagination through persistence validation", async () => {
  const db = database();
  const query = { ...simple, limit: 20, offset: 40 };
  const { query: validator } = await import(
    "../../../../stack/src/server/validators"
  );
  const prepared = (await prepareQuery(schemas, query)).preparedQuery;
  const saved = validator.parse(JSON.parse(JSON.stringify(prepared)));
  expect(saved).toMatchObject({ limit: 20, offset: 40 });
  await routes.query.handle({ database: db }, { query: saved });
  expect(db.driver.exec).toHaveBeenCalledTimes(1);
  expect(vi.mocked(db.driver.exec).mock.calls[0]![1]).toEqual([20, 40]);
  await routes.queryCount.handle({ database: db }, { query: saved });
  const [sql, values] = vi.mocked(db.driver.exec).mock.calls[1]!;
  expect(sql).toContain("COUNT(*)");
  expect(sql).not.toMatch(/LIMIT|OFFSET/);
  expect(values).toEqual([]);
});

it("cancels only the requested database execution", async () => {
  const db = database();
  let signal: AbortSignal | undefined;
  db.driver.exec = vi.fn((_sql, _values, options) => {
    signal = options?.signal;
    return new Promise<never>(() => {});
  });
  const executionId = "d6cdd730-bd80-4b2d-8fe6-56cccd44113f";
  const running = routes.query.handle(
    { database: db },
    { query: simple, executionId }
  );
  const rejected = expect(running).rejects.toThrow("cancelled");
  await new Promise((resolve) => setTimeout(resolve, 0));
  await routes.cancelQuery.handle({ database: database() }, { executionId });
  expect(signal?.aborted).toBe(false);
  await routes.cancelQuery.handle({ database: db }, { executionId });
  await rejected;
  expect(signal?.aborted).toBe(true);
});

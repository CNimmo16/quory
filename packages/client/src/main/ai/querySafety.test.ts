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
      expect(values).toEqual([payload]);
    }
    expect(http.driver.exec).toHaveBeenLastCalledWith(
      expect.stringContaining("SELECT COUNT(*)"),
      [payload]
    );
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
      []
    );
  });
});

it("accepts prepared queries resubmitted by the editor through HTTP", async () => {
  const { preparedQuery } = await prepareQuery(schemas, simple);
  const db = database();
  await expect(
    routes.query.handle({ database: db }, { query: preparedQuery })
  ).resolves.toBeDefined();
  expect(db.driver.exec).toHaveBeenCalledTimes(2);
});

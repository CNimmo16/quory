import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  protection: undefined as string | undefined,
  generation: 1,
  execute: vi.fn(),
  compile: vi.fn(),
  request: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock("../repositories/savedQueryService", () => ({
  savedQueryService: {
    assertConnection: async (input: string | { generation: number }) => {
      if (typeof input !== "string" && input.generation !== mocks.generation)
        throw new Error("Connection changed");
      return {
        connectionId: "local",
        generation: mocks.generation,
        projectId: "project",
        projectGeneration: 1,
      };
    },
  },
}));
vi.mock("../state/activeConnectionState", () => ({
  default: {
    getActiveConnection: async () => ({
      _id: "local",
      nickname: "Production",
      writeProtection: mocks.protection,
    }),
  },
}));
vi.mock("../state/quorySession", () => ({
  invalidateQuorySchema: mocks.invalidate,
  getQuorySession: async () => ({
    request: Object.assign(mocks.request, {
      compileQuery: mocks.compile,
      executeSql: mocks.execute,
    }),
  }),
}));
import { sqlProcedures } from "./sqlProcedures";
import { router } from "../util/trpc";
const caller = router(sqlProcedures).createCaller({});
const input = (sql = "SELECT $1 AS value") => ({
  connectionId: "local",
  sql,
  parameters: ["text"],
  executionId: randomUUID(),
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.protection = undefined;
  mocks.generation = 1;
  mocks.execute.mockResolvedValue({
    columns: ["value"],
    rows: [[1n], [null]],
    affectedRows: null,
    truncated: false,
  });
});
it("defaults old connections to read only and executes reads with database read protection", async () => {
  const result = await caller.executeSql(input());
  expect(result).toMatchObject({
    status: "executed",
    columns: ["value"],
    rows: [["1"], [null]],
  });
  expect(mocks.execute).toHaveBeenCalledWith(
    "SELECT $1 AS value",
    ["text"],
    true,
    expect.any(String)
  );
});
it.each([
  "DELETE FROM orders",
  "WITH deleted AS (DELETE FROM orders RETURNING *) SELECT * FROM deleted",
  "SELECT * INTO copy FROM orders",
  "SELECT 1 /*! INTO OUTFILE '/tmp/file' */",
])("blocks a write without reaching the driver: %s", async (sql) => {
  await expect(caller.executeSql(input(sql))).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  expect(mocks.execute).not.toHaveBeenCalled();
});
it("requires a single-use confirmation tied to exact SQL and bound values", async () => {
  mocks.protection = "confirm-before-write";
  const statement = input("UPDATE orders SET status = $1");
  const pending = await caller.executeSql(statement);
  expect(pending.status).toBe("confirmation-required");
  expect(mocks.execute).not.toHaveBeenCalled();
  if (pending.status !== "confirmation-required")
    throw new Error("Missing confirmation");
  await caller.executeSql({ ...statement, confirmationToken: pending.token });
  expect(mocks.execute).toHaveBeenCalledWith(
    statement.sql,
    statement.parameters,
    false,
    statement.executionId
  );
  expect(mocks.invalidate).toHaveBeenCalledOnce();
  await expect(
    caller.executeSql({ ...statement, confirmationToken: pending.token })
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(mocks.execute).toHaveBeenCalledOnce();
});
it.each(["sql", "parameters", "connection"])(
  "rejects a confirmation when %s changes",
  async (change) => {
    mocks.protection = "confirm-before-write";
    const statement = input("DELETE FROM orders WHERE status = $1");
    const pending = await caller.executeSql(statement);
    if (pending.status !== "confirmation-required")
      throw new Error("Missing confirmation");
    if (change === "connection") ++mocks.generation;
    await expect(
      caller.executeSql({
        ...statement,
        ...(change === "sql" ? { sql: "DELETE FROM users" } : {}),
        ...(change === "parameters" ? { parameters: ["changed"] } : {}),
        confirmationToken: pending.token,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.execute).not.toHaveBeenCalled();
  }
);
it("executes dangerous writes without prompting and rejects batches and transaction controls", async () => {
  mocks.protection = "dangerously-write";
  expect((await caller.executeSql(input("DELETE FROM orders"))).status).toBe(
    "executed"
  );
  expect(mocks.execute).toHaveBeenCalledWith(
    "DELETE FROM orders",
    ["text"],
    false,
    expect.any(String)
  );
  mocks.execute.mockClear();
  for (const sql of [
    "SELECT 1; DELETE FROM orders",
    "COMMIT",
    "SET TRANSACTION READ WRITE",
  ])
    await expect(caller.executeSql(input(sql))).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  expect(mocks.execute).not.toHaveBeenCalled();
});
it("compiles the current relationship query with its bound parameters", async () => {
  mocks.compile.mockResolvedValue({
    sql: "SELECT * FROM orders WHERE status = $1",
    parameters: ["paid"],
    dialect: "postgres",
  });
  const query = {
    base: { tableRef: "public.orders", select: "*" as const },
    limit: 100,
    offset: 0,
  };
  const result = await caller.compileSql({ connectionId: "local", query });
  expect(result.parameters).toEqual(["paid"]);
  expect(mocks.compile).toHaveBeenCalledWith(query);
});

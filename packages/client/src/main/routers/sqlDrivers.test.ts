import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ postgres: vi.fn(), begin: vi.fn(), unsafe: vi.fn(), values: vi.fn(), end: vi.fn(), pgCancel: vi.fn(), getConnection: vi.fn(), query: vi.fn(), execute: vi.fn(), commit: vi.fn(), rollback: vi.fn(), destroy: vi.fn() }));
vi.mock("postgres", () => ({ default: mocks.postgres }));
vi.mock("mysql2/promise", () => ({ default: { createPool: () => ({ getConnection: mocks.getConnection }) } }));
import { PostgresDriver } from "../../../../postgres/src/PostgresDriver";
import { MySQLDriver } from "../../../../mysql/src/MySQLDriver";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.postgres.mockImplementation(() => ({ begin: mocks.begin, end: mocks.end }));
  mocks.begin.mockImplementation(async (_options, run) => run({ unsafe: mocks.unsafe }));
  mocks.unsafe.mockReturnValue({ values: mocks.values });
  mocks.end.mockResolvedValue(undefined);
  mocks.commit.mockResolvedValue(undefined); mocks.rollback.mockResolvedValue(undefined);
  mocks.getConnection.mockResolvedValue({ query: mocks.query, execute: mocks.execute, commit: mocks.commit, rollback: mocks.rollback, destroy: mocks.destroy });
});
it("uses an isolated PostgreSQL read-only transaction and prepared single-statement execution", async () => {
  const rows = Object.assign([["Original", 1]], { columns: [{ name: "value" }, { name: "value" }], command: "SELECT", count: 1 });
  mocks.values.mockReturnValue(Object.assign(Promise.resolve(rows), { cancel: mocks.pgCancel }));
  const driver = new PostgresDriver({ host: "localhost" });
  expect(await driver.execSql("SELECT $1, 1", ["Original"], { readOnly: true })).toMatchObject({ columns: ["value", "value"], rows: [["Original", 1]], affectedRows: null });
  expect(mocks.begin).toHaveBeenCalledWith("READ ONLY", expect.any(Function));
  expect(mocks.unsafe).toHaveBeenCalledWith("SELECT $1, 1", ["Original"], { prepare: true });
  expect(mocks.postgres).toHaveBeenLastCalledWith(expect.objectContaining({ max: 1, connect_timeout: 15 }));
  expect(mocks.end).toHaveBeenCalledWith({ timeout: 1 });
});
it("cancels PostgreSQL statements and closes their isolated connection", async () => {
  let fail!: (error: Error) => void;
  const query = Object.assign(new Promise((_resolve, reject) => { fail = reject; }), { cancel: mocks.pgCancel });
  mocks.values.mockReturnValue(query);
  mocks.pgCancel.mockImplementation(() => fail(new Error("cancelled")));
  const driver = new PostgresDriver({ host: "localhost" });
  const controller = new AbortController();
  const pending = driver.execSql("SELECT pg_sleep(10)", [], { readOnly: true, signal: controller.signal });
  const rejected = expect(pending).rejects.toThrow("cancelled");
  await vi.waitFor(() => expect(mocks.unsafe).toHaveBeenCalledOnce());
  controller.abort();
  await rejected;
  expect(mocks.pgCancel).toHaveBeenCalledOnce();
  expect(mocks.end).toHaveBeenCalledOnce();
});
it("uses a MySQL read-only transaction and returns array rows with duplicate column names", async () => {
  mocks.execute.mockResolvedValue([[["Original", 1]], [{ name: "value" }, { name: "value" }]]);
  const driver = new MySQLDriver({ host: "localhost" });
  expect(await driver.execSql("SELECT ?, 1", ["Original"], { readOnly: true })).toMatchObject({ columns: ["value", "value"], rows: [["Original", 1]] });
  expect(mocks.query).toHaveBeenCalledWith("START TRANSACTION READ ONLY");
  expect(mocks.execute).toHaveBeenCalledWith({ sql: "SELECT ?, 1", rowsAsArray: true }, ["Original"]);
  expect(mocks.commit).toHaveBeenCalledOnce();
  expect(mocks.destroy).toHaveBeenCalledOnce();
});
it("rolls back failed MySQL writes and disposes the connection", async () => {
  mocks.execute.mockRejectedValue(new Error("Write failed"));
  const driver = new MySQLDriver({ host: "localhost" });
  await expect(driver.execSql("DELETE FROM items", [], { readOnly: false })).rejects.toThrow("Write failed");
  expect(mocks.query).toHaveBeenCalledWith("START TRANSACTION");
  expect(mocks.rollback).toHaveBeenCalledOnce();
  expect(mocks.commit).not.toHaveBeenCalled();
  expect(mocks.destroy).toHaveBeenCalledOnce();
});

import { expect, it } from "vitest";
import sqlite from "better-sqlite3";
import { SqliteDriver } from "./SqliteDriver";

it("closes its disposable in-memory database once", async () => {
  const client = sqlite(":memory:");
  const driver = new SqliteDriver(client);
  await Promise.all([driver.teardown(), driver.teardown()]);
  expect(client.open).toBe(false);
});

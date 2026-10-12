import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sqlite from "better-sqlite3";
import { expect, it } from "vitest";
import { WorkerSqliteDriver } from "./WorkerSqliteDriver";

it("runs metadata and queries in a responsive worker; cancels, recovers, and closes", async () => {
  const directory = mkdtempSync(join(tmpdir(), "quory-worker-"));
  const filename = join(directory, "test.db");
  const db = sqlite(filename);
  db.exec(
    "CREATE TABLE items(id INTEGER PRIMARY KEY); INSERT INTO items VALUES(1)"
  );
  db.close();
  const driver = new WorkerSqliteDriver(filename);
  const slow =
    "WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<1000000000) SELECT sum(x) FROM n";
  try {
    await driver.testConnection();
    expect(await driver.getAllColumnsInDatabase()).toHaveLength(1);
    expect(await driver.getAllForeignKeysInDatabase()).toEqual([]);
    const controller = new AbortController();
    let ticked = false;
    const running = driver.exec(slow, [], { signal: controller.signal });
    const rejection = expect(running).rejects.toThrow("cancelled");
    await new Promise<void>((resolve) =>
      setTimeout(() => {
        ticked = true;
        controller.abort();
        resolve();
      }, 30)
    );
    await rejection;
    expect(ticked).toBe(true);
    expect(await driver.exec("SELECT id FROM items WHERE id=?", [1])).toEqual([
      { id: 1 },
    ]);
    await expect(driver.exec(slow, [], { timeoutMs: 30 })).rejects.toThrow(
      "timed out"
    );
    expect(await driver.exec("SELECT 1 AS n")).toEqual([{ n: 1 }]);
    await driver.teardown();
    await expect(driver.exec("SELECT 1")).rejects.toThrow("closed");
  } finally {
    await driver.teardown();
    rmSync(directory, { recursive: true, force: true });
  }
}, 10_000);

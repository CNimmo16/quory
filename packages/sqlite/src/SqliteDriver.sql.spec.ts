import sqlite from "better-sqlite3";
import { expect, it } from "vitest";
import { SqliteDriver } from "./SqliteDriver";
it("enforces read-only SQL at the database and supports explicit writes and duplicate column names", async () => {
  const db = sqlite(":memory:");
  db.exec(
    "CREATE TABLE items(id INTEGER PRIMARY KEY, name TEXT); INSERT INTO items VALUES (1, 'Original')"
  );
  const driver = new SqliteDriver(db);
  try {
    expect(
      await driver.execSql("SELECT name AS value, id AS value FROM items", [], {
        readOnly: true,
      })
    ).toMatchObject({ columns: ["value", "value"], rows: [["Original", 1]] });
    await expect(
      driver.execSql("UPDATE items SET name = 'Blocked' RETURNING name", [], {
        readOnly: true,
      })
    ).rejects.toThrow("read-only");
    db.function("mutate", () => {
      db.prepare("UPDATE items SET name = 'Hidden write'").run();
      return 1;
    });
    await expect(
      driver.execSql("SELECT mutate()", [], { readOnly: true })
    ).rejects.toThrow();
    expect(db.prepare("SELECT name FROM items").get()).toEqual({
      name: "Original",
    });
    expect(
      await driver.execSql("UPDATE items SET name = ?", ["Changed"], {
        readOnly: false,
      })
    ).toMatchObject({ affectedRows: 1 });
    expect(
      await driver.execSql("SELECT name FROM items", [], { readOnly: true })
    ).toMatchObject({ rows: [["Changed"]] });
    await expect(
      driver.execSql("SELECT 1; DELETE FROM items", [], { readOnly: false })
    ).rejects.toThrow();
  } finally {
    await driver.teardown();
  }
});

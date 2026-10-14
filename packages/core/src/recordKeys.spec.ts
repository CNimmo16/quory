import { afterEach, expect, it } from "vitest";
import sqlite from "better-sqlite3";
import { SqliteDriver } from "../../sqlite/src/SqliteDriver";
import { getSchemas, prepareQuery, runQuery, type Query } from ".";

const databases: sqlite.Database[] = [];
afterEach(() => databases.splice(0).forEach((db) => db.close()));

it("identifies repeated records by the complete hidden primary key without adding visible columns", async () => {
  const db = sqlite(":memory:");
  databases.push(db);
  db.exec(`
    CREATE TABLE parents (tenant INTEGER, id INTEGER, name TEXT, PRIMARY KEY (tenant, id));
    CREATE TABLE children (id INTEGER PRIMARY KEY, tenant INTEGER, parent INTEGER, label TEXT,
      FOREIGN KEY (tenant, parent) REFERENCES parents(tenant, id));
    INSERT INTO parents VALUES (1, 23, 'Same name'), (12, 3, 'Same name');
    INSERT INTO children VALUES (1, 1, 23, 'First'), (2, 12, 3, 'Second'), (3, 1, 23, 'Third');
  `);
  const driver = new SqliteDriver(db);
  const schemas = await getSchemas(driver);
  const query: Query = {
    base: {
      tableRef: "main.children",
      select: ["label"],
      orderBy: [{ column: "id", direction: "asc" }],
      joins: [{ tableRef: "main.parents", select: ["name"] }],
    },
  };
  const { rows, meta } = await runQuery(driver, schemas, query);
  expect(rows.map((row) => row[1]!.recordKey)).toEqual([
    "[1,23]",
    "[12,3]",
    "[1,23]",
  ]);
  expect(rows.map((row) => row[0]!.recordKey)).toEqual(["[1]", "[2]", "[3]"]);
  expect(rows[0]!.map((join) => join.data)).toEqual([
    { label: "First" },
    { name: "Same name" },
  ]);
  expect(meta.preparedQuery.base.select).toEqual(["label"]);
  expect(meta.preparedQuery.base.joins[0]!.select).toEqual(["name"]);
  expect(
    (await prepareQuery(schemas, query)).sql.split(" FROM ")[0]
  ).not.toContain('"id" AS');
});

it("never assigns an identity without a complete, non-null primary key", async () => {
  const db = sqlite(":memory:");
  databases.push(db);
  db.exec(`
    CREATE TABLE unkeyed (label TEXT);
    INSERT INTO unkeyed VALUES ('Same'), ('Same');
    CREATE TABLE nullable_keys (tenant INTEGER, id INTEGER, label TEXT, PRIMARY KEY (tenant, id));
    INSERT INTO nullable_keys VALUES (NULL, 1, 'Same'), (1, 1, 'Same');
  `);
  const driver = new SqliteDriver(db);
  const schemas = await getSchemas(driver);
  const unkeyed = await runQuery(driver, schemas, {
    base: { tableRef: "main.unkeyed", select: ["label"] },
  });
  expect(unkeyed.rows.map((row) => row[0]!.recordKey)).toEqual([null, null]);
  const nullable = await runQuery(driver, schemas, {
    base: { tableRef: "main.nullable_keys", select: ["label"] },
  });
  expect(nullable.rows.map((row) => row[0]!.recordKey)).toEqual([
    null,
    "[1,1]",
  ]);
});

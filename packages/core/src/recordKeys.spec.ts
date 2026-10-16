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
    (await prepareQuery(schemas, query)).sql.split(" FROM ")[0],
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

it("decodes duplicate table instances and colliding result names with hidden keys", async () => {
  const db = sqlite(":memory:");
  databases.push(db);
  db.exec(`
    CREATE TABLE a__b (id INTEGER PRIMARY KEY, c TEXT);
    CREATE TABLE a (id INTEGER PRIMARY KEY, b__c TEXT, first_id INTEGER, second_id INTEGER,
      FOREIGN KEY (first_id) REFERENCES a__b(id),
      FOREIGN KEY (second_id) REFERENCES a__b(id));
    INSERT INTO a__b VALUES (10, 'First'), (20, 'Second');
    INSERT INTO a VALUES (1, 'Base', 10, 20);
  `);
  const driver = new SqliteDriver(db);
  const schemas = await getSchemas(driver);
  const query: Query = {
    base: {
      tableRef: "main.a",
      select: ["b__c"],
      joins: ["first_id", "second_id"].map((column) => ({
        tableRef: "main.a__b",
        via: [
          { tableRef: "main.a__b", fromColumnName: column, toColumnName: "id" },
        ],
        select: ["c"],
      })),
    },
  };
  const compiled = await prepareQuery(schemas, query);
  expect(compiled.preparedQuery.base.resultAliases.b__c).toBe("main__a__b__c");
  expect(compiled.preparedQuery.base.joins[0]!.resultAliases.c).toBe(
    "main__a__b__c__2",
  );
  expect(compiled.preparedQuery.base.joins[1]!.joinAlias).toBe("main__a__b__2");
  const { rows } = await runQuery(driver, schemas, query);
  expect(rows[0]!.map((join) => join.data)).toEqual([
    { b__c: "Base" },
    { c: "First" },
    { c: "Second" },
  ]);
  expect(rows[0]!.map((join) => join.recordKey)).toEqual([
    "[1]",
    "[10]",
    "[20]",
  ]);
});

it("executes and decodes shortened, quoted Unicode aliases", async () => {
  const db = sqlite(":memory:");
  databases.push(db);
  const table = `order_雪_${"fulfilment_".repeat(6)}`;
  const column = `created_雨_${"timestamp_".repeat(6)}"`;
  const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
  db.exec(`CREATE TABLE ${quote(table)} (id INTEGER PRIMARY KEY, ${quote(
    column,
  )} TEXT);
    INSERT INTO ${quote(table)} VALUES (7, 'Value');`);
  const driver = new SqliteDriver(db);
  const schemas = await getSchemas(driver);
  const query: Query = {
    base: { tableRef: `main.${table}`, select: [column] },
  };
  const { preparedQuery, recordKeyAliases } = await prepareQuery(
    schemas,
    query,
    "sqlite",
    { includeRecordKeys: true },
  );
  for (const alias of [
    preparedQuery.base.joinAlias,
    ...Object.values(preparedQuery.base.resultAliases),
    ...Object.values(recordKeyAliases).flat(),
  ]) {
    expect(new TextEncoder().encode(alias).length).toBeLessThanOrEqual(63);
  }
  const { rows } = await runQuery(driver, schemas, query);
  expect(rows[0]![0]!.data).toEqual({ [column]: "Value" });
  expect(rows[0]![0]!.recordKey).toBe("[7]");
});

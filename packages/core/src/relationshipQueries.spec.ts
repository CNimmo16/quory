import { afterEach, describe, expect, it } from "vitest";
import sqlite from "better-sqlite3";
import { SqliteDriver } from "../../sqlite/src/SqliteDriver";
import {
  getSchemas,
  getTableRelationships,
  prepareQuery,
  runQuery,
  getCountForQuery,
  type DatabaseSchema,
  type Query,
} from ".";

const databases: sqlite.Database[] = [];
afterEach(() => databases.splice(0).forEach((db) => db.close()));
function database(sql: string) {
  const db = sqlite(":memory:");
  databases.push(db);
  db.exec(sql);
  return new SqliteDriver(db);
}

describe("constraint-aware query results", () => {
  it.each([false, true])(
    "joins every pair in both directions (implicit primary key: %s)",
    async (implicit) => {
      const driver = database(`
      CREATE TABLE parents (tenant_id INTEGER, id INTEGER, label TEXT, PRIMARY KEY (tenant_id, id));
      CREATE TABLE children (id INTEGER PRIMARY KEY, tenant_id INTEGER, parent_id INTEGER,
        FOREIGN KEY (tenant_id, parent_id) REFERENCES parents ${
          implicit ? "" : "(tenant_id, id)"
        });
      INSERT INTO parents VALUES (1, 10, 'correct'), (1, 20, 'wrong parent'), (2, 10, 'wrong tenant');
      INSERT INTO children VALUES (100, 1, 10);
    `);
      const schemas = await getSchemas(driver);
      const parents = schemas[0]!.tables.find((t) => t.name === "parents")!;
      expect(
        parents.columns.filter((c) => c.includedInPrimaryKey).map((c) => c.name)
      ).toEqual(["tenant_id", "id"]);
      expect(
        getTableRelationships(
          schemas[0]!.tables.find((t) => t.name === "children")!,
          "main"
        )[0]!.columnPairs
      ).toEqual([
        { localColumn: "tenant_id", foreignColumn: "tenant_id" },
        { localColumn: "parent_id", foreignColumn: "id" },
      ]);
      for (const [base, joined] of [
        ["children", "parents"],
        ["parents", "children"],
      ]) {
        const query: Query = {
          base: {
            tableRef: `main.${base}`,
            select: "*",
            joins: [{ tableRef: `main.${joined}`, select: "*" }],
          },
        };
        const { rows, sql } = await runQuery(driver, schemas, query);
        expect(sql).toMatch(/ ON .* AND /);
        expect(rows).toHaveLength(1);
        expect(
          rows[0]!.find((j) => j.tableRef === "main.parents")!.data.label
        ).toBe("correct");
      }
    }
  );

  it("rejects parallel constraints for compile, execute, and count in either direction", async () => {
    const driver = database(`
      CREATE TABLE people (id INTEGER PRIMARY KEY);
      CREATE TABLE messages (id INTEGER PRIMARY KEY, sender INTEGER REFERENCES people(id), recipient INTEGER REFERENCES people(id));
      INSERT INTO people VALUES (1), (2);
      INSERT INTO messages VALUES (10, 1, 2);
    `);
    const schemas = await getSchemas(driver);
    for (const [base, joined] of [
      ["people", "messages"],
      ["messages", "people"],
    ]) {
      const query: Query = {
        base: {
          tableRef: `main.${base}`,
          select: "*",
          joins: [{ tableRef: `main.${joined}`, select: "*" }],
        },
      };
      await expect(prepareQuery(schemas, query)).rejects.toThrow(
        "Multiple relationships"
      );
      await expect(runQuery(driver, schemas, query)).rejects.toThrow(
        "Multiple relationships"
      );
      await expect(getCountForQuery(driver, schemas, query)).rejects.toThrow(
        "Multiple relationships"
      );
    }
  });

  it("rejects two composite constraints sharing a local column", async () => {
    const driver = database(`
      CREATE TABLE parents (tenant_id INTEGER, id INTEGER, PRIMARY KEY (tenant_id, id));
      CREATE TABLE children (tenant_id INTEGER, parent_id INTEGER, other_parent_id INTEGER,
        FOREIGN KEY (tenant_id, parent_id) REFERENCES parents(tenant_id, id),
        FOREIGN KEY (tenant_id, other_parent_id) REFERENCES parents(tenant_id, id));
    `);
    const schemas = await getSchemas(driver);
    const relationships = getTableRelationships(
      schemas[0]!.tables.find((table) => table.name === "children")!,
      "main"
    );
    expect(relationships).toHaveLength(2);
    expect(relationships.map((ref) => ref.columnPairs.length)).toEqual([2, 2]);
    await expect(
      prepareQuery(schemas, {
        base: {
          tableRef: "main.children",
          select: "*",
          joins: [{ tableRef: "main.parents", select: "*" }],
        },
      })
    ).rejects.toThrow("Multiple relationships");
  });

  it("decodes distinct table instances reached through independent paths", async () => {
    const driver = database(`
      CREATE TABLE people (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE senders (id INTEGER PRIMARY KEY, person_id INTEGER REFERENCES people(id));
      CREATE TABLE recipients (id INTEGER PRIMARY KEY, person_id INTEGER REFERENCES people(id));
      CREATE TABLE messages (id INTEGER PRIMARY KEY, sender_id INTEGER REFERENCES senders(id), recipient_id INTEGER REFERENCES recipients(id));
      INSERT INTO people VALUES (1, 'Alice'), (2, 'Bob');
      INSERT INTO senders VALUES (11, 1);
      INSERT INTO recipients VALUES (22, 2);
      INSERT INTO messages VALUES (33, 11, 22);
    `);
    const schemas = await getSchemas(driver);
    const { rows, meta } = await runQuery(driver, schemas, {
      base: {
        tableRef: "main.messages",
        select: ["id"],
        joins: [
          { tableRef: "main.people", via: ["main.senders"], select: ["name"] },
          {
            tableRef: "main.people",
            via: ["main.recipients"],
            select: ["name"],
          },
        ],
      },
    });
    const people = rows[0]!.filter((j) => j.tableRef === "main.people");
    expect(people.map((j) => j.data.name)).toEqual(["Alice", "Bob"]);
    expect(new Set(meta.joinsList.map((j) => j.joinAlias)).size).toBe(
      meta.joinsList.length
    );
    expect(people[0]!.joinAlias).not.toBe(people[1]!.joinAlias);
  });

  it("uses bounded aliases and exposes the exact result mapping", async () => {
    const tableName = "parent_" + "x".repeat(50);
    const columnName = "label_" + "y".repeat(50);
    const driver = database(
      `CREATE TABLE ${tableName} (id INTEGER PRIMARY KEY, ${columnName} TEXT); INSERT INTO ${tableName} VALUES (1, 'value');`
    );
    const { sql, rows, meta } = await runQuery(
      driver,
      await getSchemas(driver),
      { base: { tableRef: `main.${tableName}`, select: "*" } }
    );
    expect(meta.preparedQuery.base.joinAlias.length).toBeLessThan(63);
    const alias = meta.preparedQuery.base.resultAliases[columnName]!;
    expect(alias.length).toBeLessThan(63);
    expect(sql).toContain(`AS "${alias}"`);
    expect(rows[0]![0]!.data[columnName]).toBe("value");
  });

  it("keeps legacy independent column relationships ambiguous", async () => {
    const driver = database(
      `CREATE TABLE people (id INTEGER PRIMARY KEY); CREATE TABLE messages (id INTEGER PRIMARY KEY, sender INTEGER REFERENCES people(id), recipient INTEGER REFERENCES people(id));`
    );
    const schemas = await getSchemas(driver);
    for (const schema of schemas)
      for (const table of schema.tables)
        for (const column of table.columns) {
          for (const key of column.foreignKeys) {
            delete key.constraintId;
            delete key.columnPosition;
          }
        }
    await expect(
      prepareQuery(schemas, {
        base: {
          tableRef: "main.messages",
          select: "*",
          joins: [{ tableRef: "main.people", select: "*" }],
        },
      })
    ).rejects.toThrow("Multiple relationships");
  });

  it("orders pairs and rejects incomplete constraint metadata", () => {
    const column = (
      name: string,
      position: number
    ): DatabaseSchema["tables"][number]["columns"][number] => ({
      name,
      dataType: "INTEGER",
      genericDataType: "number",
      isNullable: false,
      includedInPrimaryKey: false,
      foreignKeyReferences: [],
      foreignKeys: [
        {
          constraintId: "fk",
          columnPosition: position,
          foreignSchemaName: "main",
          foreignTableName: "parent",
          foreignColumnName: name,
          confidence: 1,
          hasForeignKeyConstraint: true,
        },
      ],
    });
    expect(
      getTableRelationships(
        { name: "child", columns: [column("b", 2), column("a", 1)] },
        "main"
      )[0]!.columnPairs.map((pair) => pair.localColumn)
    ).toEqual(["a", "b"]);
    expect(() =>
      getTableRelationships(
        { name: "child", columns: [column("b", 2)] },
        "main"
      )
    ).toThrow("Incomplete");
  });
});

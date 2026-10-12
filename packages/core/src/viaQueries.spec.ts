import { afterEach, describe, expect, it } from "vitest";
import sqlite from "better-sqlite3";
import { SqliteDriver } from "../../sqlite/src/SqliteDriver";
import {
  getSchemas,
  runQuery,
  prepareQuery,
  getCountForQuery,
  areQueriesEqual,
  ConditionOperator,
  type Query,
  type ViaStep,
} from ".";

const databases: sqlite.Database[] = [];
afterEach(() => databases.splice(0).forEach((db) => db.close()));
async function fixture() {
  const db = sqlite(":memory:");
  databases.push(db);
  db.exec(`
    CREATE TABLE people (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE messages (id INTEGER PRIMARY KEY, sender INTEGER REFERENCES people(id), recipient INTEGER REFERENCES people(id));
    CREATE TABLE profiles (id INTEGER PRIMARY KEY, person_id INTEGER REFERENCES people(id), label TEXT);
    INSERT INTO people VALUES (1, 'Alice'), (2, 'Bob');
    INSERT INTO messages VALUES (10, 1, 2), (20, 2, 1);
    INSERT INTO profiles VALUES (100, 1, 'Alice profile'), (200, 2, 'Bob profile');
  `);
  const driver = new SqliteDriver(db);
  const schemas = await getSchemas(driver);
  const keys = await driver.getAllForeignKeysInDatabase();
  const senderId = keys.find(
    (key) => key.localTable === "messages" && key.localColumn === "sender"
  )!.constraintId!;
  return { driver, schemas, senderId };
}
function query(via: ViaStep[]): Query {
  return {
    base: {
      tableRef: "main.messages",
      select: ["id"],
      where: { column: "id", operator: ConditionOperator.EQUALS, value: "10" },
      joins: [{ tableRef: "main.people", select: ["name"], via }],
    },
  };
}

describe("via relationship selectors", () => {
  it("selects sender and recipient independently using only fromColumnName", async () => {
    const { driver, schemas } = await fixture();
    const input = query([]);
    input.base.joins = [
      {
        tableRef: "main.people",
        select: ["name"],
        via: [{ tableRef: "main.people", fromColumnName: "sender" }],
      },
      {
        tableRef: "main.people",
        select: ["name"],
        via: [{ tableRef: "main.people", fromColumnName: "recipient" }],
      },
    ];
    const result = await runQuery(driver, schemas, input);
    expect(result.rows[0]!.slice(1).map((join) => join.data.name)).toEqual([
      "Alice",
      "Bob",
    ]);
    expect(
      (await runQuery(driver, schemas, result.meta.preparedQuery)).rows
    ).toEqual(result.rows);
    expect((await getCountForQuery(driver, schemas, input)).count).toBe(1);
  });

  it("allows only toColumnName when traversing a constraint in reverse", async () => {
    const { driver, schemas } = await fixture();
    for (const [column, expected] of [
      ["sender", 10],
      ["recipient", 20],
    ] as const) {
      const { rows } = await runQuery(driver, schemas, {
        base: {
          tableRef: "main.people",
          select: ["name"],
          where: {
            column: "id",
            operator: ConditionOperator.EQUALS,
            value: "1",
          },
          joins: [
            {
              tableRef: "main.messages",
              select: ["id"],
              via: [{ tableRef: "main.messages", toColumnName: column }],
            },
          ],
        },
      });
      expect(rows[0]![1]!.data.id).toBe(expected);
    }
  });

  it("accepts constraint IDs and both directional column names", async () => {
    const { driver, schemas, senderId } = await fixture();
    for (const via of [
      [{ tableRef: "main.people", usingConstraintId: senderId }],
      [
        {
          tableRef: "main.people",
          fromColumnName: "sender",
          toColumnName: "id",
        },
      ],
    ]) {
      expect(
        (await runQuery(driver, schemas, query(via))).rows[0]![1]!.data.name
      ).toBe("Alice");
    }
  });

  it("keeps differently constrained intermediate paths separate and reusable", async () => {
    const { driver, schemas } = await fixture();
    const input = query([]);
    input.base.joins = ["sender", "recipient"].map((fromColumnName) => ({
      tableRef: "main.profiles",
      select: ["label"],
      via: [{ tableRef: "main.people", fromColumnName }],
    }));
    const result = await runQuery(driver, schemas, input);
    expect(
      result.rows[0]!.filter((join) => join.tableRef === "main.profiles").map(
        (join) => join.data.label
      )
    ).toEqual(["Alice profile", "Bob profile"]);
    expect(
      (await runQuery(driver, schemas, result.meta.preparedQuery)).rows.map(
        (row) => row.map((join) => join.data)
      )
    ).toEqual(result.rows.map((row) => row.map((join) => join.data)));
  });

  it("normalizes string and object waypoints to identical plans and equality", async () => {
    const { schemas } = await fixture();
    const input: Query = {
      base: {
        tableRef: "main.profiles",
        select: ["id"],
        joins: [
          { tableRef: "main.people", select: ["name"], via: ["main.people"] },
        ],
      },
    };
    const longhand = structuredClone(input);
    longhand.base.joins![0]!.via = [{ tableRef: "main.people" }];
    expect(await prepareQuery(schemas, input)).toEqual(
      await prepareQuery(schemas, longhand)
    );
    expect(areQueriesEqual(schemas, input, longhand)).toBe(true);
  });

  it("reports remaining ambiguity with available relationships and selector guidance", async () => {
    const { driver, schemas } = await fixture();
    for (const via of [
      [],
      ["main.people"],
      [{ tableRef: "main.people" }],
      [{ tableRef: "main.people", toColumnName: "id" }],
    ]) {
      await expect(prepareQuery(schemas, query(via))).rejects.toThrow(
        /Multiple relationships.*fromColumnName.*usingConstraintId.*sender.*recipient/
      );
      await expect(runQuery(driver, schemas, query(via))).rejects.toThrow(
        "Multiple relationships"
      );
      await expect(
        getCountForQuery(driver, schemas, query(via))
      ).rejects.toThrow("Multiple relationships");
    }
  });

  it("rejects nonexistent or contradictory selectors instead of falling back", async () => {
    const { schemas, senderId } = await fixture();
    for (const step of [
      { tableRef: "main.people", fromColumnName: "missing" },
      { tableRef: "main.people", usingConstraintId: "missing" },
      {
        tableRef: "main.people",
        fromColumnName: "sender",
        toColumnName: "name",
      },
    ])
      await expect(prepareQuery(schemas, query([step]))).rejects.toThrow(
        "No relationship matches"
      );
    await expect(
      prepareQuery(
        schemas,
        query([
          {
            tableRef: "main.people",
            fromColumnName: "sender",
            usingConstraintId: senderId,
          },
        ] as unknown as ViaStep[])
      )
    ).rejects.toThrow("not both");
    await expect(
      prepareQuery(
        schemas,
        query([{ tableRef: "main.people", fromColumnName: "" }])
      )
    ).rejects.toThrow("non-empty");
    await expect(
      prepareQuery(schemas, query(["main.people", "main.profiles"]))
    ).rejects.toThrow("must be the final");
    await expect(
      prepareQuery(
        schemas,
        query([{ tableRef: "main.profiles", fromColumnName: "sender" }])
      )
    ).rejects.toThrow("No relationship matches");
  });

  it("selects complete composite constraints by ID or one discriminating column", async () => {
    const db = sqlite(":memory:");
    databases.push(db);
    db.exec(`CREATE TABLE parents (tenant INTEGER, id INTEGER, label TEXT, PRIMARY KEY(tenant, id));
      CREATE TABLE children (id INTEGER PRIMARY KEY, tenant INTEGER, first_id INTEGER, second_id INTEGER,
        FOREIGN KEY(tenant, first_id) REFERENCES parents(tenant, id), FOREIGN KEY(tenant, second_id) REFERENCES parents(tenant, id));
      INSERT INTO parents VALUES (1, 10, 'first'), (1, 20, 'second'), (2, 10, 'wrong tenant');
      INSERT INTO children VALUES (1, 1, 10, 20);`);
    const driver = new SqliteDriver(db);
    const schemas = await getSchemas(driver);
    const constraintId = (await driver.getAllForeignKeysInDatabase()).find(
      (key) => key.localColumn === "first_id"
    )!.constraintId!;
    for (const selector of [
      { usingConstraintId: constraintId },
      { fromColumnName: "first_id" },
    ]) {
      const { rows, sql } = await runQuery(driver, schemas, {
        base: {
          tableRef: "main.children",
          select: ["id"],
          joins: [
            {
              tableRef: "main.parents",
              select: ["label"],
              via: [{ tableRef: "main.parents", ...selector }],
            },
          ],
        },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]![1]!.data.label).toBe("first");
      expect(sql).toMatch(/ ON .* AND /);
    }
    await expect(
      prepareQuery(schemas, {
        base: {
          tableRef: "main.children",
          select: ["id"],
          joins: [
            {
              tableRef: "main.parents",
              select: ["label"],
              via: [{ tableRef: "main.parents", fromColumnName: "tenant" }],
            },
          ],
        },
      })
    ).rejects.toThrow("Multiple relationships");
  });
});

it("combines quoted composite relationships, via selectors, and bound filters", async () => {
  const db = sqlite(":memory:");
  databases.push(db);
  db.exec(`
    CREATE TABLE "odd""parents" (tenant INTEGER, id INTEGER, label TEXT, PRIMARY KEY(tenant, id));
    CREATE TABLE "odd""children" (id INTEGER PRIMARY KEY, tenant INTEGER, "parent""id" INTEGER,
      FOREIGN KEY(tenant, "parent""id") REFERENCES "odd""parents");
  `);
  const value = "O'Connor\\ OR 1=1 --";
  db.prepare('INSERT INTO "odd""parents" VALUES (?, ?, ?)').run(1, 10, value);
  db.prepare('INSERT INTO "odd""parents" VALUES (?, ?, ?)').run(2, 10, value);
  db.exec('INSERT INTO "odd""children" VALUES (1, 1, 10)');
  const driver = new SqliteDriver(db);
  const schemas = await getSchemas(driver);
  const input: Query = {
    base: {
      tableRef: 'main.odd"children',
      select: ["id"],
      joins: [
        {
          tableRef: 'main.odd"parents',
          select: ["label"],
          via: [{ tableRef: 'main.odd"parents', fromColumnName: 'parent"id' }],
          where: { column: "label", operator: ConditionOperator.EQUALS, value },
        },
      ],
    },
    limit: 10,
  };
  const result = await runQuery(driver, schemas, input);
  expect(result.sql).not.toContain(value);
  expect(result.rows).toHaveLength(1);
  expect(result.rows[0]![1]!.data.label).toBe(value);
  expect((await getCountForQuery(driver, schemas, input)).count).toBe(1);
  expect(
    (await runQuery(driver, schemas, result.meta.preparedQuery)).rows
  ).toEqual(result.rows);
});

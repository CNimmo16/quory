import sqlite from "better-sqlite3";
import { describe, expect, it } from "vitest";
import {
  ConditionOperator as Op,
  isConditionComplete,
  parseToCompleteCondition,
  prepareQuery,
  quoteIdentifier,
  validateQuery,
  type Condition,
  type DatabaseSchema,
  type Query,
} from ".";

const schemas: DatabaseSchema[] = [
  {
    name: "main",
    tables: [
      {
        name: "items",
        columns: ["id", "status", 'note"`'].map((name) => ({
          name,
          dataType: "text",
          genericDataType: "text",
          isNullable: true,
          includedInPrimaryKey: name === "id",
          foreignKeys: [],
          foreignKeyReferences: [],
        })),
      },
    ],
  },
];
const queryWith = (where: Condition): Query => ({
  base: { tableRef: "main.items", select: ["id"], where },
});
const x: Condition = { column: "status", operator: Op.EQUALS, value: "open" };
const y: Condition = { column: 'note"`', operator: Op.IS_NULL };
const z: Condition = { column: "id", operator: Op.EQUALS, value: "3" };
const blank: Condition = { column: "", operator: Op.EQUALS, value: "" };

it.each(["postgres", "mysql", "sqlite"] as const)(
  "compiles nested null checks in %s without consuming parameter positions",
  async (dialect) => {
    const { sql, parameters, preparedQuery } = await prepareQuery(
      schemas,
      queryWith({
        operator: Op.OR,
        conditions: [
          { operator: Op.AND, conditions: [x, y] },
          {
            operator: Op.AND,
            conditions: [
              { column: 'note"`', operator: Op.IS_NOT_NULL },
              z,
              { column: "status", operator: Op.IN, values: ["a", "b"] },
            ],
          },
        ],
      }),
      dialect,
    );
    const ref = (name: string) =>
      `${quoteIdentifier(preparedQuery.base.joinAlias, dialect)}.${quoteIdentifier(name, dialect)}`;
    const placeholders =
      dialect === "postgres" ? ["$1", "$2", "$3", "$4"] : ["?", "?", "?", "?"];
    expect(sql.split(" WHERE ")[1]?.split(" GROUP BY ")[0]).toBe(
      `((${ref("status")} = ${placeholders[0]} AND ${ref('note"`')} IS NULL) OR (${ref('note"`')} IS NOT NULL AND ${ref("id")} = ${placeholders[1]} AND ${ref("status")} IN (${placeholders[2]},${placeholders[3]})))`,
    );
    expect(parameters).toEqual(["open", "3", "a", "b"]);
  },
);

it("executes grouping and distinguishes SQL NULL from empty strings and literal NULL", async () => {
  const db = sqlite(":memory:");
  try {
    db.exec(`
      CREATE TABLE items (id INTEGER PRIMARY KEY, status TEXT, ${quoteIdentifier('note"`', "sqlite")} TEXT);
      INSERT INTO items VALUES
        (1, 'open', NULL), (2, 'closed', NULL), (3, 'closed', 'present'),
        (4, 'open', 'NULL'), (5, 'open', '');
    `);
    async function ids(where: Condition) {
      const { sql, parameters } = await prepareQuery(
        schemas,
        queryWith(where),
        "sqlite",
      );
      return db
        .prepare(sql)
        .all(...parameters)
        .map((row) => Object.values(row as object)[0]);
    }
    expect(
      await ids({
        operator: Op.OR,
        conditions: [{ operator: Op.AND, conditions: [x, y] }, z],
      }),
    ).toEqual([1, 3]);
    expect(
      await ids({
        operator: Op.AND,
        conditions: [x, { operator: Op.OR, conditions: [y, z] }],
      }),
    ).toEqual([1]);
    expect(await ids({ column: 'note"`', operator: Op.IS_NULL })).toEqual([
      1, 2,
    ]);
    expect(await ids({ column: 'note"`', operator: Op.IS_NOT_NULL })).toEqual([
      3, 4, 5,
    ]);
    expect(
      await ids({ column: 'note"`', operator: Op.EQUALS, value: "NULL" }),
    ).toEqual([4]);
  } finally {
    db.close();
  }
});

it.each([Op.IS_NULL, Op.IS_NOT_NULL] as const)(
  "validates %s as a column-only condition",
  (operator) => {
    const where = { column: 'note"`', operator };
    expect(() => validateQuery(schemas, queryWith(where))).not.toThrow();
    for (const extra of [
      { value: "NULL" },
      { values: [] },
      { conditions: [] },
    ]) {
      expect(() =>
        validateQuery(schemas, queryWith({ ...where, ...extra })),
      ).toThrow("Unexpected query field");
    }
    expect(() =>
      validateQuery(schemas, queryWith({ column: "missing", operator })),
    ).toThrow("column");
  },
);

describe("filter drafts", () => {
  it("removes blank drafts recursively while retaining explicit group structure", () => {
    const draft: Condition = {
      operator: Op.OR,
      conditions: [
        {
          operator: Op.AND,
          conditions: [blank, x, { operator: Op.OR, conditions: [] }],
        },
        y,
        blank,
      ],
    };
    const original = structuredClone(draft);
    expect(parseToCompleteCondition(draft)).toEqual({
      operator: Op.OR,
      conditions: [{ operator: Op.AND, conditions: [x] }, y],
    });
    expect(draft).toEqual(original);
    expect(
      parseToCompleteCondition({
        operator: Op.AND,
        conditions: [blank, { operator: Op.OR, conditions: [] }],
      }),
    ).toBeNull();
  });

  it.each<Condition>([
    { column: "status", operator: Op.EQUALS, value: "" },
    { column: "", operator: Op.EQUALS, value: "open" },
    { column: "status", operator: Op.IN, values: [] },
    { column: "", operator: Op.IS_NULL },
    { column: "", operator: Op.IS_NOT_NULL },
  ])("rejects partial filters even within nested groups: %j", (partial) => {
    expect(isConditionComplete(partial)).toBe(false);
    expect(() =>
      parseToCompleteCondition({
        operator: Op.OR,
        conditions: [x, { operator: Op.AND, conditions: [partial] }],
      }),
    ).toThrow(/filter/);
  });

  it("requires a column for null checks and treats empty groups as incomplete", () => {
    expect(isConditionComplete(y)).toBe(true);
    expect(
      isConditionComplete({ column: "status", operator: Op.IS_NOT_NULL }),
    ).toBe(true);
    expect(isConditionComplete({ operator: Op.AND, conditions: [] })).toBe(
      false,
    );
    expect(isConditionComplete({ operator: Op.AND, conditions: [x, y] })).toBe(
      true,
    );
  });
});

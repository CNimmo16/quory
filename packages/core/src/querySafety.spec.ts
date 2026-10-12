import { describe, expect, it, vi } from "vitest";
import {
  ConditionOperator,
  type DatabaseSchema,
  type Query,
  type DatabaseDriver,
  type SqlDialect,
} from ".";
import prepareQuery from "./prepareQuery";
import runQuery from "./runQuery";
import getCountForQuery from "./getCountForQuery";

const schemas: DatabaseSchema[] = [
  {
    name: 'pub"lic`',
    tables: [
      {
        name: "Order.Items",
        columns: ["id", 'select"`', "display name"].map((name) => ({
          name,
          dataType: "text",
          genericDataType: "text",
          isNullable: false,
          includedInPrimaryKey: name === "id",
          foreignKeys: [],
          foreignKeyReferences: [],
        })),
      },
    ],
  },
];
const base: Query = { base: { tableRef: 'pub"lic`.Order.Items', select: "*" } };
const hostile = "\\' OR 1=1; --\0雪";
const filtered: Query = {
  base: {
    ...base.base,
    where: {
      operator: ConditionOperator.AND,
      conditions: [
        {
          column: "display name",
          operator: ConditionOperator.EQUALS,
          value: hostile,
        },
        {
          column: 'select"`',
          operator: ConditionOperator.IN,
          values: ["O'Connor", "", "100%_"],
        },
      ],
    },
    orderBy: [{ column: 'select"`', direction: "desc" }],
  },
  limit: 25,
};
function driver(dialect: SqlDialect): DatabaseDriver {
  return {
    dialect,
    exec: vi.fn().mockResolvedValue([{ count: 2 }]),
    getAllColumnsInDatabase: vi.fn(),
    getAllForeignKeysInDatabase: vi.fn(),
    testConnection: vi.fn(),
  };
}

describe.each(["postgres", "mysql", "sqlite"] as const)(
  "%s query safety",
  (dialect) => {
    it("quotes every identifier and binds nested scalar/list values and limits", async () => {
      const db = driver(dialect);
      const { sql, parameters } = await prepareQuery(
        schemas,
        filtered,
        dialect
      );
      expect(parameters).toEqual([hostile, "O'Connor", "", "100%_"]);
      parameters.forEach((value) => {
        if (value) expect(sql).not.toContain(value);
      });
      if (dialect === "mysql") {
        expect(sql).toContain(
          'FROM `pub"lic```.`Order.Items` AS `quory__join__1`'
        );
        expect(sql).toContain('`select"``` DESC');
        expect(sql).toContain("IN (?,?,?)");
      } else {
        expect(sql).toContain(
          'FROM "pub""lic`"."Order.Items" AS "quory__join__1"'
        );
        expect(sql).toContain('"select""`" DESC');
        expect(sql).toContain(
          dialect === "postgres" ? "IN ($2,$3,$4)" : "IN (?,?,?)"
        );
      }
      await runQuery(db, schemas, filtered);
      expect(db.exec).toHaveBeenCalledWith(
        sql + (dialect === "postgres" ? " LIMIT $5" : " LIMIT ?"),
        [...parameters, 25]
      );
      await getCountForQuery(db, schemas, filtered);
      expect(db.exec).toHaveBeenLastCalledWith(
        `SELECT COUNT(*) AS count FROM (${sql}) AS quory_count`,
        parameters
      );
    });

    it.each(["select", "where", "orderBy"])(
      "rejects injected %s columns before executing data or count",
      async (field) => {
        const query = structuredClone(base);
        const column = "id, (SELECT 123)";
        if (field === "select") query.base.select = [column];
        if (field === "where")
          query.base.where = {
            column,
            operator: ConditionOperator.EQUALS,
            value: "safe",
          };
        if (field === "orderBy")
          query.base.orderBy = [{ column, direction: "asc" }];
        const db = driver(dialect);
        await expect(runQuery(db, schemas, query)).rejects.toThrow("column");
        await expect(getCountForQuery(db, schemas, query)).rejects.toThrow(
          "column"
        );
        expect(db.exec).not.toHaveBeenCalled();
      }
    );
  }
);

it.each([
  null,
  {},
  { base: null },
  { ...base, limit: NaN },
  { ...base, limit: 0 },
  { ...base, limit: 1.5 },
  { base: { ...base.base, select: [] } },
  { base: { ...base.base, tableRef: 'pub"lic`.missing' } },
  { base: { ...base.base, via: ["public.missing"] } },
  {
    base: {
      ...base.base,
      orderBy: [{ column: "id", direction: "asc; SELECT 1" }],
    },
  },
  {
    base: {
      ...base.base,
      where: { column: "id", operator: "= ?; SELECT 1", value: "x" },
    },
  },
  { base: { ...base.base, where: { operator: "and", conditions: [] } } },
  {
    base: { ...base.base, where: { column: "id", operator: "in", values: [] } },
  },
  {
    base: {
      ...base.base,
      where: { column: "id", operator: "in", values: ["x"], value: {} },
    },
  },
  { base: { ...base.base, where: { column: "id", operator: "=", value: 5 } } },
  { base: { ...base.base, joins: "invalid" } },
])("rejects malformed runtime query %#", async (query) => {
  const db = driver("sqlite");
  await expect(runQuery(db, schemas, query as Query)).rejects.toThrow();
  expect(db.exec).not.toHaveBeenCalled();
});

it("rejects cyclic input before recursive compilation", async () => {
  const query = structuredClone(base);
  query.base.joins = [query.base];
  await expect(prepareQuery(schemas, query)).rejects.toThrow("Too many");
});

it("allows SQL-looking identifiers only when they exist in metadata, and quotes them", async () => {
  const unusual = structuredClone(schemas);
  unusual[0]!.tables[0]!.columns[0]!.name = "id, (SELECT 123)";
  const { sql } = await prepareQuery(unusual, {
    base: {
      ...base.base,
      orderBy: [{ column: "id, (SELECT 123)", direction: "asc" }],
    },
  });
  expect(sql).toContain('"id, (SELECT 123)" ASC');
});

it("accepts resubmitted prepared-query metadata without trusting its identifiers", async () => {
  const { preparedQuery } = await prepareQuery(schemas, filtered);
  preparedQuery.base.joinAlias = "evil, (SELECT 123)";
  const result = await prepareQuery(schemas, preparedQuery);
  expect(result.sql).not.toContain("evil");
  expect(result.parameters).toEqual([hostile, "O'Connor", "", "100%_"]);
});

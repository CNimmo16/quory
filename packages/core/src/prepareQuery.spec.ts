import { ConditionOperator, DatabaseSchema } from ".";
import FakeDatabaseDriver from "./FakeDatabaseDriver";
import { format as formatSql } from "@sqltools/formatter";
import { describe, expect, it } from "vitest";
import prepareQuery from "./prepareQuery";

describe("prepareQuery", () => {
  const fakeDatabaseDriver = new FakeDatabaseDriver();

  fakeDatabaseDriver.mockExecResponse([
    {
      foo: "bar",
    },
  ]);

  const mockSchema: DatabaseSchema = {
    name: "public",
    tables: ["customer", "order", "order_fulfilment", "phone_number"].map(
      (name) => ({
        name,
        columns: [
          {
            name: "id",
            includedInPrimaryKey: true,
            dataType: "number",
            genericDataType: "number",
            isNullable: false,
            foreignKeys: [],
            foreignKeyReferences: [],
          },
        ],
      }),
    ),
  };

  const addRelation = (sourceTable: string, targetTable: string) => {
    mockSchema.tables
      .find((table) => table.name === sourceTable)!
      .columns.push({
        name: "customer_id",
        includedInPrimaryKey: false,
        dataType: "number",
        genericDataType: "number",
        isNullable: false,
        foreignKeys: [
          {
            foreignColumnName: "id",
            foreignSchemaName: "public",
            foreignTableName: targetTable,
            confidence: 1,
            hasForeignKeyConstraint: true,
          },
        ],
        foreignKeyReferences: [],
      });
    mockSchema.tables
      .find((table) => table.name === targetTable)!
      .columns.find((col) => col.name === "id")!
      .foreignKeyReferences.push({
        localSchemaName: "public",
        localTableName: sourceTable,
        localColumnName: "customer_id",
        confidence: 1,
        hasForeignKeyConstraint: true,
      });
  };

  addRelation("order", "customer");
  addRelation("order_fulfilment", "order");
  addRelation("phone_number", "customer");
  addRelation("phone_number", "order");

  const mockSchemas: DatabaseSchema[] = [mockSchema];

  it("finds related row from hasMany relations", async () => {
    const { sql, parameters } = await prepareQuery(mockSchemas, {
      base: {
        tableRef: "public.customer",
        select: "*",
        where: {
          column: "id",
          operator: ConditionOperator.EQUALS,
          value: "3",
        },
        joins: [
          {
            tableRef: "public.order",
            select: "*",
          },
          {
            tableRef: "public.order_fulfilment",
            select: "*",
          },
        ],
      },
    });

    expect(parameters).toEqual(["3"]);
    expect(formatSql(sql)).toEqual(
      formatSql(`
        SELECT "public__customer"."id" AS "public__customer__id",
          "public__order"."id" AS "public__order__id",
          "public__order"."customer_id" AS "public__order__customer_id",
          "public__order_fulfilment"."id" AS "public__order_fulfilment__id",
          "public__order_fulfilment"."customer_id" AS "public__order_fulfilment__customer_id"
        FROM "public"."customer" AS "public__customer"
          INNER JOIN "public"."order" AS "public__order" ON "public__order"."customer_id" = "public__customer"."id"
          INNER JOIN "public"."order_fulfilment" AS "public__order_fulfilment" ON "public__order_fulfilment"."customer_id" = "public__order"."id"
        WHERE "public__customer"."id" = ?
        GROUP BY "public__customer"."id",
          "public__order"."id",
          "public__order_fulfilment"."id"
      `),
    );
  });

  it("finds related row from belongsTo relations", async () => {
    const { sql, parameters } = await prepareQuery(mockSchemas, {
      base: {
        tableRef: "public.order_fulfilment",
        select: "*",
        where: {
          operator: ConditionOperator.EQUALS,
          column: "id",
          value: "1",
        },
        joins: [
          {
            tableRef: "public.customer",
            select: "*",
          },
        ],
      },
    });

    expect(parameters).toEqual(["1"]);
    expect(formatSql(sql)).toEqual(
      formatSql(`
        SELECT "public__order_fulfilment"."id" AS "public__order_fulfilment__id",
          "public__order_fulfilment"."customer_id" AS "public__order_fulfilment__customer_id",
          "public__customer"."id" AS "public__customer__id"
        FROM "public"."order_fulfilment" AS "public__order_fulfilment"
          INNER JOIN "public"."order" AS "public__order" ON "public__order"."id" = "public__order_fulfilment"."customer_id"
          INNER JOIN "public"."customer" AS "public__customer" ON "public__customer"."id" = "public__order"."customer_id"
        WHERE "public__order_fulfilment"."id" = ?
        GROUP BY "public__order_fulfilment"."id",
          "public__order"."id",
          "public__customer"."id"
      `),
    );
  });

  it("supports same table in path twice", async () => {
    const { sql, parameters } = await prepareQuery(mockSchemas, {
      base: {
        tableRef: "public.customer",
        select: "*",
        where: {
          column: "id",
          operator: ConditionOperator.EQUALS,
          value: "3",
        },
        joins: [
          {
            tableRef: "public.phone_number",
            select: [],
          },
          {
            tableRef: "public.order",
            select: [],
            where: {
              column: "id",
              operator: ConditionOperator.EQUALS,
              value: "1",
            },
            joins: [
              {
                tableRef: "public.phone_number",
                select: [],
                joins: [
                  {
                    tableRef: "public.order_fulfilment",
                    select: [],
                    where: {
                      column: "id",
                      operator: ConditionOperator.GREATER_THAN,
                      value: "2",
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    expect(parameters).toEqual(["3", "1", "2"]);
    expect(formatSql(sql)).toEqual(
      formatSql(`
        SELECT "public__customer"."id" AS "public__customer__id"
        FROM "public"."customer" AS "public__customer"
          INNER JOIN "public"."phone_number" AS "public__phone_number" ON "public__phone_number"."customer_id" = "public__customer"."id"
          INNER JOIN "public"."order" AS "public__order" ON "public__order"."customer_id" = "public__customer"."id"
          INNER JOIN "public"."phone_number" AS "public__phone_number__2" ON "public__phone_number__2"."customer_id" = "public__order"."id"
          INNER JOIN "public"."order" AS "public__order__2" ON "public__order__2"."id" = "public__phone_number__2"."customer_id"
          INNER JOIN "public"."order_fulfilment" AS "public__order_fulfilment" ON "public__order_fulfilment"."customer_id" = "public__order__2"."id"
        WHERE "public__customer"."id" = ?
          AND "public__order"."id" = ?
          AND "public__order_fulfilment"."id" > ?
        GROUP BY "public__customer"."id",
          "public__phone_number"."id",
          "public__order"."id",
          "public__phone_number__2"."id",
          "public__order__2"."id",
          "public__order_fulfilment"."id"
      `),
    );
  });

  describe("orderBy priority", () => {
    it("sorts ORDER BY columns by priority (higher priority first)", async () => {
      const { sql } = await prepareQuery(mockSchemas, {
        base: {
          tableRef: "public.customer",
          select: "*",
          orderBy: [{ column: "id", direction: "asc", priority: 1 }],
          joins: [
            {
              tableRef: "public.order",
              select: "*",
              orderBy: [{ column: "id", direction: "desc", priority: 3 }],
            },
            {
              tableRef: "public.phone_number",
              select: "*",
              orderBy: [{ column: "id", direction: "asc", priority: 2 }],
            },
          ],
        },
      });

      // Priority 3 (order.id) should come first, then priority 2 (phone_number.id), then priority 1 (customer.id)
      expect(sql).toContain(
        'ORDER BY "public__order"."id" DESC,"public__phone_number"."id" ASC,"public__customer"."id" ASC',
      );
    });

    it("defaults missing priority to 0", async () => {
      const { sql } = await prepareQuery(mockSchemas, {
        base: {
          tableRef: "public.customer",
          select: "*",
          orderBy: [
            { column: "id", direction: "asc" }, // No priority, should default to 0
          ],
          joins: [
            {
              tableRef: "public.order",
              select: "*",
              orderBy: [{ column: "id", direction: "desc", priority: 5 }],
            },
          ],
        },
      });

      // Priority 5 (order.id) should come first, then priority 0 (customer.id)
      expect(sql).toContain(
        'ORDER BY "public__order"."id" DESC,"public__customer"."id" ASC',
      );
    });

    it("maintains position order for equal priorities (stable sort)", async () => {
      const { sql } = await prepareQuery(mockSchemas, {
        base: {
          tableRef: "public.customer",
          select: "*",
          orderBy: [{ column: "id", direction: "asc", priority: 2 }],
          joins: [
            {
              tableRef: "public.order",
              select: "*",
              orderBy: [{ column: "id", direction: "desc", priority: 2 }],
            },
            {
              tableRef: "public.phone_number",
              select: "*",
              orderBy: [{ column: "id", direction: "asc", priority: 2 }],
            },
          ],
        },
      });

      // All have priority 2, so order should follow tree traversal order:
      // customer (base), then order (first join), then phone_number (second join)
      expect(sql).toContain(
        'ORDER BY "public__customer"."id" ASC,"public__order"."id" DESC,"public__phone_number"."id" ASC',
      );
    });

    it("handles mix of priorities and missing priorities", async () => {
      const { sql } = await prepareQuery(mockSchemas, {
        base: {
          tableRef: "public.customer",
          select: "*",
          orderBy: [
            { column: "id", direction: "asc" }, // priority 0 (default)
          ],
          joins: [
            {
              tableRef: "public.order",
              select: "*",
              orderBy: [{ column: "id", direction: "desc", priority: 10 }],
            },
            {
              tableRef: "public.phone_number",
              select: "*",
              orderBy: [
                { column: "id", direction: "asc" }, // priority 0 (default)
              ],
            },
          ],
        },
      });

      // Priority 10 first, then the two priority 0 entries in tree order
      expect(sql).toContain(
        'ORDER BY "public__order"."id" DESC,"public__customer"."id" ASC,"public__phone_number"."id" ASC',
      );
    });

    it("supports multiple orderBy columns with different priorities in same join", async () => {
      const { sql } = await prepareQuery(mockSchemas, {
        base: {
          tableRef: "public.customer",
          select: ["id"],
          orderBy: [{ column: "id", direction: "asc", priority: 1 }],
          joins: [
            {
              tableRef: "public.order",
              select: ["id", "customer_id"],
              orderBy: [
                { column: "id", direction: "desc", priority: 3 },
                { column: "customer_id", direction: "asc", priority: 2 },
              ],
            },
          ],
        },
      });

      // Priority 3 (order.id) first, then priority 2 (order.customer_id), then priority 1 (customer.id)
      expect(sql).toContain(
        'ORDER BY "public__order"."id" DESC,"public__order"."customer_id" ASC,"public__customer"."id" ASC',
      );
    });

    it("respects priorities on deeply nested orderBy clauses", async () => {
      const { sql } = await prepareQuery(mockSchemas, {
        base: {
          tableRef: "public.customer",
          select: ["id"],
          orderBy: [{ column: "id", direction: "asc", priority: 0 }],
          joins: [
            {
              tableRef: "public.order",
              select: ["id", "customer_id"],
              orderBy: [
                { column: "id", direction: "desc", priority: 3 },
                { column: "customer_id", direction: "asc", priority: 2 },
              ],
              joins: [
                {
                  tableRef: "public.order_fulfilment",
                  select: ["id", "customer_id"],
                  orderBy: [{ column: "id", direction: "asc", priority: 9 }],
                },
              ],
            },
          ],
        },
      });

      expect(sql).toContain(
        'ORDER BY "public__order_fulfilment"."id" ASC,"public__order"."id" DESC,"public__order"."customer_id" ASC,"public__customer"."id" ASC',
      );
    });
  });
});

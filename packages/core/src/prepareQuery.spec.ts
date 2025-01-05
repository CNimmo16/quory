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
      })
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
    const { sql } = await prepareQuery(mockSchemas, {
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

    expect(formatSql(sql)).toEqual(
      formatSql(`
        SELECT public__customer__1.id AS public__customer__id,
          public__order__1.id AS public__order__id,
          public__order__1.customer_id AS public__order__customer_id,
          public__order_fulfilment__1.id AS public__order_fulfilment__id,
          public__order_fulfilment__1.customer_id AS public__order_fulfilment__customer_id
        FROM public.customer AS public__customer__1
          INNER JOIN public.order AS public__order__1 ON public__order__1.customer_id = public__customer__1.id
          INNER JOIN public.order_fulfilment AS public__order_fulfilment__1 ON public__order_fulfilment__1.customer_id = public__order__1.id
        WHERE public__customer__1.id = '3'
        GROUP BY public__customer__1.id,
          public__order__1.id,
          public__order_fulfilment__1.id
      `)
    );
  });

  it("finds related row from belongsTo relations", async () => {
    const { sql } = await prepareQuery(mockSchemas, {
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

    expect(formatSql(sql)).toEqual(
      formatSql(`
        SELECT public__order_fulfilment__1.id AS public__order_fulfilment__id,
          public__order_fulfilment__1.customer_id AS public__order_fulfilment__customer_id,
          public__customer__1.id AS public__customer__id
        FROM public.order_fulfilment AS public__order_fulfilment__1
          INNER JOIN public.order AS public__order__1 ON public__order__1.id = public__order_fulfilment__1.customer_id
          INNER JOIN public.customer AS public__customer__1 ON public__customer__1.id = public__order__1.customer_id
        WHERE public__order_fulfilment__1.id = '1'
        GROUP BY public__order_fulfilment__1.id,
          public__order__1.id,
          public__customer__1.id
      `)
    );
  });

  it("supports same table in path twice", async () => {
    const { sql } = await prepareQuery(mockSchemas, {
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

    expect(formatSql(sql)).toEqual(
      formatSql(`
        SELECT public__customer__1.id AS public__customer__id
        FROM public.customer AS public__customer__1
          INNER JOIN public.phone_number AS public__phone_number__1 ON public__phone_number__1.customer_id = public__customer__1.id
          INNER JOIN public.order AS public__order__1 ON public__order__1.customer_id = public__customer__1.id
          INNER JOIN public.phone_number AS public__phone_number__2 ON public__phone_number__2.customer_id = public__order__1.id
          INNER JOIN public.order AS public__order__2 ON public__order__2.id = public__phone_number__2.customer_id
          INNER JOIN public.order_fulfilment AS public__order_fulfilment__1 ON public__order_fulfilment__1.customer_id = public__order__2.id
        WHERE public__customer__1.id = '3'
          AND public__order__1.id = '1'
          AND public__order_fulfilment__1.id > '2'
        GROUP BY public__customer__1.id,
          public__phone_number__1.id,
          public__order__1.id,
          public__phone_number__2.id,
          public__order__2.id,
          public__order_fulfilment__1.id
      `)
    );
  });
});

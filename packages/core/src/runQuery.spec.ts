import { ConditionOperator, DatabaseSchema } from ".";
import FakeDatabaseDriver from "./FakeDatabaseDriver";
import runQuery from "./runQuery";
import { format as formatSql } from "@sqltools/formatter";
import { describe, expect, it } from "vitest";

describe("runQuery", () => {
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

  // it("finds related row from hasMany relations", async () => {
  //   const { sql, meta } = await runQuery(
  //     fakeDatabaseDriver,
  //     mockRelationships,
  //     {
  //       base: {
  //         tableRef: "customer_data.customers",
  //         select: "*",
  //         where: {
  //           column: "id",
  //           operator: ConditionOperator.EQUALS,
  //           value: "3",
  //         },
  //         joins: [
  //           {
  //             tableRef: "order_data.orders",
  //             select: "*",
  //           },
  //           {
  //             tableRef: "order_data.order_fulfilment",
  //             select: "*",
  //           },
  //         ],
  //       },
  //     }
  //   );

  //   expect(formatSql(sql)).toEqual(
  //     formatSql(`
  //       SELECT
  //         customer_data.customers.id AS customer_data__customers__id,
  //         sq1.order_data__orders__1__id AS order_data__orders__id,
  //         sq1.order_data__orders__1__customer_id AS order_data__orders__customer_id,
  //         sq1.order_data__order_fulfilment__1__order_id AS order_data__order_fulfilment__order_id,
  //         sq1.order_data__order_fulfilment__1__status AS order_data__order_fulfilment__status
  //       FROM customer_data.customers
  //       INNER JOIN (SELECT
  //           order_data__orders__1.id AS order_data__orders__1__id,
  //           order_data__orders__1.customer_id AS order_data__orders__1__customer_id,
  //           order_data__order_fulfilment__1.order_id AS order_data__order_fulfilment__1__order_id,
  //           order_data__order_fulfilment__1.status AS order_data__order_fulfilment__1__status
  //         FROM order_data.orders AS order_data__orders__1
  //         INNER JOIN order_data.order_fulfilment AS order_data__order_fulfilment__1 ON order_data__order_fulfilment__1.order_id = order_data__orders__1.id
  //         GROUP BY order_data__orders__1.id, order_data__order_fulfilment__1.order_id) AS sq1
  //       ON customer_data.customers.id = sq1.order_data__orders__1__customer_id
  //       WHERE customer_data.customers.id = '3'
  //       GROUP BY customer_data.customers.id
  //     `)
  //   );

  //   expect(meta).toEqual({
  //     subQueries: [
  //       {
  //         id: "sq1",
  //         path: [
  //           "customer_data.customers",
  //           "order_data.orders",
  //           "order_data.order_fulfilment",
  //         ],
  //       },
  //     ],
  //   });
  // });

  // it("finds related row from belongsTo relations", async () => {
  //   const { sql } = await runQuery(fakeDatabaseDriver, mockRelationships, {
  //     base: {
  //       tableRef: "order_data.order_fulfilment",
  //       select: "*",
  //       where: {
  //         order_id: {
  //           operator: "=",
  //           value: "1",
  //         },
  //       },
  //     },
  //     joins: [
  //       {
  //         tableRef: "customer_data.customers",
  //         select: "*",
  //       },
  //     ],
  //   });

  //   expect(formatSql(sql)).toEqual(
  //     formatSql(`
  //       SELECT
  //         order_data.order_fulfilment.order_id AS order_data__order_fulfilment__order_id,
  //         order_data.order_fulfilment.status AS order_data__order_fulfilment__status,
  //         sq1.customer_data__customers__1__id AS customer_data__customers__id
  //       FROM order_data.order_fulfilment
  //       INNER JOIN (
  //         SELECT
  //           customer_data__customers__1.id AS customer_data__customers__1__id,
  //           order_data__orders__1.id AS order_data__orders__1__id
  //         FROM order_data.orders AS order_data__orders__1
  //         INNER JOIN customer_data.customers AS customer_data__customers__1 ON customer_data__customers__1.id = order_data__orders__1.customer_id
  //         GROUP BY order_data__orders__1.id, customer_data__customers__1.id
  //       ) AS sq1 ON order_data.order_fulfilment.order_id = sq1.order_data__orders__1__id
  //       WHERE order_data.order_fulfilment.order_id = '1'
  //       GROUP BY order_data.order_fulfilment.order_id
  //     `)
  //   );
  // });

  it("supports same table in path twice", async () => {
    const { sql, meta } = await runQuery(fakeDatabaseDriver, mockSchemas, {
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
        SELECT customer_data.customers.id AS customer_data__customers__id,
          sq1.order_data__orders__2__id AS order_data__orders__id,
          sq1.order_data__orders__2__customer_id AS order_data__orders__customer_id
        FROM customer_data.customers
          INNER JOIN (
            SELECT order_data__orders__2.id AS order_data__orders__2__id,
              order_data__orders__2.customer_id AS order_data__orders__2__customer_id,
              order_data__orders__1.customer_id AS order_data__orders__1__customer_id
            FROM order_data.orders AS order_data__orders__1
              INNER JOIN order_data.order_fulfilment AS order_data__order_fulfilment__1 ON order_data__order_fulfilment__1.order_id = order_data__orders__1.id
              INNER JOIN order_data.orders AS order_data__orders__2 ON order_data__orders__2.id = order_data__order_fulfilment__1.order_id
            WHERE order_data__orders__1.id = '1'
              AND order_data__order_fulfilment__1.status = 'shipped'
            GROUP BY order_data__orders__1.id,
              order_data__order_fulfilment__1.order_id,
              order_data__orders__2.id
          ) AS sq1 ON customer_data.customers.id = sq1.order_data__orders__1__customer_id
        WHERE customer_data.customers.id = '3'
        GROUP BY customer_data.customers.id
      `)
    );

    expect(meta).toEqual({
      subQueries: [
        {
          id: "sq1",
          path: [
            "customer_data.customers",
            "order_data.orders",
            "order_data.order_fulfilment",
            "order_data.orders",
          ],
        },
      ],
    });
  });

  // it("supports user table in path twice", async () => {
  //   const { sql } = await runQuery(fakeDatabaseDriver, mockRelationships, {
  //     base: {
  //       tableRef: "customer_data.customers",
  //       select: [],
  //       where: {
  //         id: {
  //           operator: "=",
  //           value: "3",
  //         },
  //       },
  //     },
  //     joins: [
  //       {
  //         tableRef: "order_data.orders",
  //         select: [],
  //         where: {
  //           id: {
  //             operator: "=",
  //             value: "1",
  //           },
  //         },
  //       },
  //       {
  //         tableRef: "customer_data.customers",
  //         select: "*",
  //         via: ["order_data.orders"],
  //       },
  //     ],
  //   });

  //   expect(formatSql(sql)).toEqual(
  //     formatSql(`
  //       SELECT sq1.customer_data__customers__1__id AS customer_data__customers__id
  //       FROM customer_data.customers
  //         INNER JOIN (
  //           SELECT customer_data__customers__1.id AS customer_data__customers__1__id,
  //             order_data__orders__1.customer_id AS order_data__orders__1__customer_id
  //           FROM order_data.orders AS order_data__orders__1
  //             INNER JOIN customer_data.customers AS customer_data__customers__1 ON customer_data__customers__1.id = order_data__orders__1.customer_id
  //           WHERE order_data__orders__1.id = '1'
  //           GROUP BY order_data__orders__1.id, customer_data__customers__1.id
  //         ) AS sq1 ON customer_data.customers.id = sq1.order_data__orders__1__customer_id
  //       WHERE customer_data.customers.id = '3'
  //       GROUP BY customer_data.customers.id
  //     `)
  //   );
  // });
});

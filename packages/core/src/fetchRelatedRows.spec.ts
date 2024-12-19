import { DatabaseSchema } from ".";
import FakeDatabaseDriver from "./FakeDatabaseDriver";
import fetchRelatedRows from "./fetchRelatedRows";
import { format as formatSql } from "@sqltools/formatter";

describe("fetchRelatedRows", () => {
  const fakeDatabaseDriver = new FakeDatabaseDriver();

  fakeDatabaseDriver.mockExecResponse([
    {
      foo: "bar",
    },
  ]);

  const mockRelationships: DatabaseSchema[] = [
    {
      name: "customer_data",
      tables: [
        {
          name: "customers",
          columns: [
            {
              name: "id",
              includedInPrimaryKey: true,
              dataType: "number",
              genericDataType: "number",
              isNullable: false,
              foreignKeys: [],
              foreignKeyReferences: [
                {
                  localColumnName: "customer_id",
                  localSchemaName: "order_data",
                  localTableName: "orders",
                  confidence: 1,
                  hasForeignKeyConstraint: true,
                },
              ],
            },
          ],
        },
      ],
    },
    {
      name: "order_data",
      tables: [
        {
          name: "orders",
          columns: [
            {
              name: "id",
              includedInPrimaryKey: true,
              dataType: "number",
              genericDataType: "number",
              isNullable: false,
              foreignKeys: [],
              foreignKeyReferences: [
                {
                  localSchemaName: "order_data",
                  localTableName: "order_fulfilment",
                  localColumnName: "order_id",
                  confidence: 1,
                  hasForeignKeyConstraint: true,
                },
              ],
            },
            {
              name: "customer_id",
              includedInPrimaryKey: false,
              dataType: "number",
              genericDataType: "number",
              isNullable: false,
              foreignKeys: [
                {
                  foreignColumnName: "id",
                  foreignSchemaName: "customer_data",
                  foreignTableName: "customers",
                  confidence: 1,
                  hasForeignKeyConstraint: true,
                },
              ],
              foreignKeyReferences: [],
            },
          ],
        },
        {
          name: "order_fulfilment",
          columns: [
            {
              name: "order_id",
              includedInPrimaryKey: true,
              dataType: "number",
              genericDataType: "number",
              isNullable: false,
              foreignKeys: [
                {
                  foreignColumnName: "id",
                  foreignSchemaName: "order_data",
                  foreignTableName: "orders",
                  confidence: 1,
                  hasForeignKeyConstraint: true,
                },
              ],
              foreignKeyReferences: [],
            },
          ],
        },
      ],
    },
  ];

  it("finds related row from hasMany relations", async () => {
    const { sql, meta } = await fetchRelatedRows(
      fakeDatabaseDriver,
      mockRelationships,
      {
        base: {
          tableRef: "customer_data.customers",
          select: "*",
          where: {
            id: {
              operator: "=",
              value: "3",
            },
          },
        },
        joins: [
          {
            tableRef: "order_data.orders",
            select: "*",
          },
          {
            tableRef: "order_data.order_fulfilment",
            select: "*",
          },
        ],
      }
    );

    expect(formatSql(sql)).toEqual(
      formatSql(`
        SELECT
          customer_data.customers.id AS customer_data__customers__id,
          sq1.order_data__orders__id,
          sq1.order_data__orders__customer_id,
          sq1.order_data__order_fulfilment__order_id
        FROM customer_data.customers
        INNER JOIN (SELECT
            order_data.orders.id AS order_data__orders__id,
            order_data.orders.customer_id AS order_data__orders__customer_id,
            order_data.order_fulfilment.order_id AS order_data__order_fulfilment__order_id
          FROM order_data.orders
          INNER JOIN order_data.order_fulfilment ON order_data.order_fulfilment.order_id = order_data.orders.id
          GROUP BY order_data.orders.id, order_data.order_fulfilment.order_id) AS sq1
        ON customer_data.customers.id = sq1.order_data__orders__customer_id
        WHERE customer_data.customers.id = '3'
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
          ],
          tableRefs: ["order_data.orders", "order_data.order_fulfilment"],
        },
      ],
    });
  });

  it("finds related row from belongsTo relations", async () => {
    const { sql } = await fetchRelatedRows(
      fakeDatabaseDriver,
      mockRelationships,
      {
        base: {
          tableRef: "order_data.order_fulfilment",
          select: "*",
          where: {
            order_id: {
              operator: "=",
              value: "1",
            },
          },
        },
        joins: [
          {
            tableRef: "customer_data.customers",
            select: "*",
          },
        ],
      }
    );

    expect(formatSql(sql)).toEqual(
      formatSql(`
        SELECT
          order_data.order_fulfilment.order_id AS order_data__order_fulfilment__order_id,
          sq1.customer_data__customers__id
        FROM order_data.order_fulfilment
        INNER JOIN (
          SELECT
            customer_data.customers.id AS customer_data__customers__id,
            order_data.orders.id AS order_data__orders__id
          FROM order_data.orders
          INNER JOIN customer_data.customers ON customer_data.customers.id = order_data.orders.customer_id
          GROUP BY order_data.orders.id, customer_data.customers.id
        ) AS sq1 ON order_data.order_fulfilment.order_id = sq1.order_data__orders__id
        WHERE order_data.order_fulfilment.order_id = '1'
      `)
    );
  });
});

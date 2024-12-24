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
            {
              name: "status",
              includedInPrimaryKey: false,
              dataType: "text",
              genericDataType: "text",
              isNullable: false,
              foreignKeys: [],
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
          sq1.order_data__orders__1__id AS order_data__orders__id,
          sq1.order_data__orders__1__customer_id AS order_data__orders__customer_id,
          sq1.order_data__order_fulfilment__1__order_id AS order_data__order_fulfilment__order_id,
          sq1.order_data__order_fulfilment__1__status AS order_data__order_fulfilment__status
        FROM customer_data.customers
        INNER JOIN (SELECT
            order_data__orders__1.id AS order_data__orders__1__id,
            order_data__orders__1.customer_id AS order_data__orders__1__customer_id,
            order_data__order_fulfilment__1.order_id AS order_data__order_fulfilment__1__order_id,
            order_data__order_fulfilment__1.status AS order_data__order_fulfilment__1__status
          FROM order_data.orders AS order_data__orders__1
          INNER JOIN order_data.order_fulfilment AS order_data__order_fulfilment__1 ON order_data__order_fulfilment__1.order_id = order_data__orders__1.id
          GROUP BY order_data__orders__1.id, order_data__order_fulfilment__1.order_id) AS sq1
        ON customer_data.customers.id = sq1.order_data__orders__1__customer_id
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
          order_data.order_fulfilment.status AS order_data__order_fulfilment__status,
          sq1.customer_data__customers__1__id AS customer_data__customers__id
        FROM order_data.order_fulfilment
        INNER JOIN (
          SELECT
            customer_data__customers__1.id AS customer_data__customers__1__id,
            order_data__orders__1.id AS order_data__orders__1__id
          FROM order_data.orders AS order_data__orders__1
          INNER JOIN customer_data.customers AS customer_data__customers__1 ON customer_data__customers__1.id = order_data__orders__1.customer_id
          GROUP BY order_data__orders__1.id, customer_data__customers__1.id
        ) AS sq1 ON order_data.order_fulfilment.order_id = sq1.order_data__orders__1__id
        WHERE order_data.order_fulfilment.order_id = '1'
      `)
    );
  });

  it("supports same table in path twice", async () => {
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
            select: [],
            where: {
              id: {
                operator: "=",
                value: "1",
              },
            },
          },
          {
            tableRef: "order_data.order_fulfilment",
            select: [],
            where: {
              status: {
                operator: "=",
                value: "shipped",
              },
            },
            via: ["order_data.orders"],
          },
          {
            tableRef: "order_data.orders",
            select: "*",
            via: ["order_data.orders", "order_data.order_fulfilment"],
          },
        ],
      }
    );

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

  it("supports user table in path twice", async () => {
    const { sql, meta } = await fetchRelatedRows(
      fakeDatabaseDriver,
      mockRelationships,
      {
        base: {
          tableRef: "customer_data.customers",
          select: [],
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
            select: [],
            where: {
              id: {
                operator: "=",
                value: "1",
              },
            },
          },
          {
            tableRef: "customer_data.customers",
            select: "*",
            via: ["order_data.orders"],
          },
        ],
      }
    );

    expect(formatSql(sql)).toEqual(
      formatSql(`
        SELECT sq1.customer_data__customers__1__id AS customer_data__customers__id
        FROM customer_data.customers
          INNER JOIN (
            SELECT customer_data__customers__1.id AS customer_data__customers__1__id,
              order_data__orders__1.customer_id AS order_data__orders__1__customer_id
            FROM order_data.orders AS order_data__orders__1
              INNER JOIN customer_data.customers AS customer_data__customers__1 ON customer_data__customers__1.id = order_data__orders__1.customer_id
            WHERE order_data__orders__1.id = '1'
            GROUP BY order_data__orders__1.id, customer_data__customers__1.id
          ) AS sq1 ON customer_data.customers.id = sq1.order_data__orders__1__customer_id
        WHERE customer_data.customers.id = '3'
      `)
    );
  });
});

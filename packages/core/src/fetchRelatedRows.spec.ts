import { DatabaseSchema } from ".";
import FakeDatabaseDriver from "./FakeDatabaseDriver";
import fetchRelatedRows from "./fetchRelatedRows";

const formatSqlToOneLine = (sql: string) =>
  sql.replace(/\n/g, " ").replace(/  +/g, " ").trim();

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
    const { sql } = await fetchRelatedRows(
      fakeDatabaseDriver,
      mockRelationships,
      {
        localTableRef: "customer_data.customers",
        foreignTableRef: "order_data.order_fulfilment",
        where: {
          "customer_data.customers": {
            id: {
              operator: "=",
              value: "3",
            },
          },
        },
        select: {
          "customer_data.customers": "*",
          "order_data.orders": "*",
          "order_data.order_fulfilment": "*",
        },
      }
    );

    expect(sql).toEqual(
      formatSqlToOneLine(`
        SELECT
          customer_data.customers.id AS customer_data__customers__id,
          order_data.orders.id AS order_data__orders__id,
          order_data.orders.customer_id AS order_data__orders__customer_id,
          order_data.order_fulfilment.order_id AS order_data__order_fulfilment__order_id
        FROM customer_data.customers
        INNER JOIN order_data.orders ON order_data.orders.customer_id = customer_data.customers.id
        INNER JOIN order_data.order_fulfilment ON order_data.order_fulfilment.order_id = order_data.orders.id
        WHERE customer_data.customers.id = '3'
        GROUP BY customer_data.customers.id, order_data.orders.id, order_data.order_fulfilment.order_id;
      `)
    );
  });

  it("finds related row from belongsTo relations", async () => {
    const { sql } = await fetchRelatedRows(
      fakeDatabaseDriver,
      mockRelationships,
      {
        localTableRef: "order_data.order_fulfilment",
        foreignTableRef: "customer_data.customers",
        where: {
          "order_data.order_fulfilment": {
            order_id: {
              operator: "=",
              value: "1",
            },
          },
        },
        select: {
          "order_data.orders": "*",
          "customer_data.customers": "*",
        },
      }
    );

    expect(sql).toEqual(
      formatSqlToOneLine(`
        SELECT
          order_data.orders.id AS order_data__orders__id,
          order_data.orders.customer_id AS order_data__orders__customer_id,
          customer_data.customers.id AS customer_data__customers__id
        FROM order_data.order_fulfilment
        INNER JOIN order_data.orders ON order_data.orders.id = order_data.order_fulfilment.order_id
        INNER JOIN customer_data.customers ON customer_data.customers.id = order_data.orders.customer_id
        WHERE order_data.order_fulfilment.order_id = '1'
        GROUP BY order_data.order_fulfilment.order_id, order_data.orders.id, customer_data.customers.id;
      `)
    );
  });
});

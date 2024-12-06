import { DatabaseSchema } from ".";
import { FakeDatabaseInspectionDriver } from ".";
import fetchRelatedRows from "./fetchRelatedRows";

const formatSqlToOneLine = (sql: string) =>
  sql.replace(/\n/g, " ").replace(/  +/g, " ").trim();

describe("fetchRelatedRows", () => {
  const fakeDatabaseInspectionDriver = new FakeDatabaseInspectionDriver();

  fakeDatabaseInspectionDriver.mockExecResponse([
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
      fakeDatabaseInspectionDriver,
      mockRelationships,
      {
        localSchema: "customer_data",
        localTable: "customers",
        foreignSchema: "order_data",
        foreignTable: "order_fulfilment",
        localRowData: {
          id: "3",
        },
      }
    );

    expect(sql).toEqual(
      formatSqlToOneLine(`
        SELECT * FROM customer_data.customers
        INNER JOIN order_data.orders ON order_data.orders.customer_id = customer_data.customers.id
        INNER JOIN order_data.order_fulfilment ON order_data.order_fulfilment.order_id = order_data.orders.id
        WHERE customer_data.customers.id = '3'
      `)
    );
  });

  it("finds related row from belongsTo relations", async () => {
    const { sql } = await fetchRelatedRows(
      fakeDatabaseInspectionDriver,
      mockRelationships,
      {
        localSchema: "order_data",
        localTable: "order_fulfilment",
        foreignSchema: "customer_data",
        foreignTable: "customers",
        localRowData: {
          id: "1",
        },
      }
    );

    expect(sql).toEqual(
      formatSqlToOneLine(`
        SELECT * FROM order_data.order_fulfilment
        INNER JOIN order_data.orders ON order_data.orders.id = order_data.order_fulfilment.order_id
        INNER JOIN customer_data.customers ON customer_data.customers.id = order_data.orders.customer_id
        WHERE order_data.order_fulfilment.id = '1'
      `)
    );
  });
});

import { DatabaseSchema } from ".";
import getSchemas from "./getSchemas";
import { FakeDatabaseInspectionDriver } from ".";

describe("getSchemas", () => {
  const fakeDatabaseInspectionDriver = new FakeDatabaseInspectionDriver();

  it("correctly detects all inter-table relationships", async () => {
    fakeDatabaseInspectionDriver.defineTables([
      {
        name: "customers",
        schemaName: "customer_data",
        columns: {
          id: {
            includedInPrimaryKey: true,
            genericDataType: "number",
            isNullable: false,
          },
        },
      },
      {
        name: "orders",
        schemaName: "order_data",
        columns: {
          id: {
            genericDataType: "number",
            isNullable: false,
            includedInPrimaryKey: true,
          },
          customer_id: {
            genericDataType: "number",
            isNullable: false,
            includedInPrimaryKey: false,
            references: {
              foreignColumn: "id",
              foreignTable: "customers",
              foreignSchema: "customer_data",
            },
          },
        },
      },
      {
        name: "order_fulfilment",
        schemaName: "order_data",
        columns: {
          order_id: {
            genericDataType: "number",
            isNullable: false,
            includedInPrimaryKey: true,
            references: {
              foreignColumn: "id",
              foreignTable: "orders",
              foreignSchema: "order_data",
            },
          },
        },
      },
    ]);

    const schemas = await getSchemas(fakeDatabaseInspectionDriver);

    expect(schemas).toHaveLength(2);
    expect(schemas).toEqual<DatabaseSchema[]>([
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
                    localSchemaName: "order_data",
                    localTableName: "orders",
                    localColumnName: "customer_id",
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
                    foreignSchemaName: "customer_data",
                    foreignTableName: "customers",
                    foreignColumnName: "id",
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
                    foreignSchemaName: "order_data",
                    foreignTableName: "orders",
                    foreignColumnName: "id",
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
    ]);
  });
});

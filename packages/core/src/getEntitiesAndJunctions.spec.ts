import { DatabaseSchema, DatabaseTableInfo } from ".";
import getEntitiesAndJunctions from "./getEntitiesAndJunctions";

describe("getEntitiesAndJunctions", () => {
  it("correctly detects all entities and junction tables", async () => {
    const people: DatabaseTableInfo = {
      name: "people",
      columns: [
        {
          name: "id",
          includedInPrimaryKey: true,
          dataType: "number",
          genericDataType: "number" as const,
          isNullable: false,
          foreignKeys: [],
          foreignKeyReferences: [
            {
              localColumnName: "person_id",
              localSchemaName: "order_data",
              localTableName: "orders",
              confidence: 1,
              hasForeignKeyConstraint: true,
            },
          ],
        },
      ],
    };
    const peopleOrders: DatabaseTableInfo = {
      name: "people_orders",
      columns: [
        {
          name: "person_id",
          includedInPrimaryKey: true,
          dataType: "number",
          genericDataType: "number" as const,
          isNullable: false,
          foreignKeys: [
            {
              foreignColumnName: "id",
              foreignSchemaName: "people_data",
              foreignTableName: "people",
              confidence: 1,
              hasForeignKeyConstraint: true,
            },
          ],
          foreignKeyReferences: [],
        },
        {
          name: "order_id",
          includedInPrimaryKey: true,
          dataType: "number",
          genericDataType: "number" as const,
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
    };
    const orderFulfilment: DatabaseTableInfo = {
      name: "order_fulfilment",
      columns: [
        {
          name: "order_id",
          includedInPrimaryKey: true,
          dataType: "number",
          genericDataType: "number" as const,
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
    };
    const orders: DatabaseTableInfo = {
      name: "orders",
      columns: [
        {
          name: "id",
          includedInPrimaryKey: true,
          dataType: "number",
          genericDataType: "number" as const,
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
      ],
    };

    const mockRelationships: DatabaseSchema[] = [
      {
        name: "people_data",
        tables: [people],
      },
      {
        name: "order_data",
        tables: [orders, orderFulfilment, peopleOrders],
      },
    ];

    const { junctions, entities } = getEntitiesAndJunctions(mockRelationships);

    expect(junctions).toEqual(["order_data.people_orders"]);
    expect(entities).toEqual([
      "people_data.people",
      "order_data.orders",
      "order_data.order_fulfilment",
    ]);
  });
});

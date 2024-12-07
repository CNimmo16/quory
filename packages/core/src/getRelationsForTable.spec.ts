import { DatabaseSchema, DatabaseTableInfo } from ".";
import getRelationsForTable from "./getRelationsForTable";

describe("getRelationsForTable", () => {
  it("correctly detects all relations", async () => {
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
            {
              localColumnName: "order_id",
              localSchemaName: "order_data",
              localTableName: "people_orders",
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

    const relationsForOrders = getRelationsForTable(
      mockRelationships,
      "order_data",
      "orders"
    );

    expect(
      relationsForOrders.sort((a, b) => a.tableName.localeCompare(b.tableName))
    ).toEqual([
      {
        schemaName: "order_data",
        tableName: "order_fulfilment",
        shortestJoinPath: 1,
      },
      {
        schemaName: "people_data",
        tableName: "people",
        shortestJoinPath: 2,
      },
      {
        schemaName: "order_data",
        tableName: "people_orders",
        shortestJoinPath: 1,
      },
    ]);
  });

  it("limits relations by maxJoins", async () => {
    const movies: DatabaseTableInfo = {
      name: "movies",
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
              localColumnName: "movie_id",
              localSchemaName: "public",
              localTableName: "movie_actors",
              confidence: 1,
              hasForeignKeyConstraint: true,
            },
          ],
        },
      ],
    };
    const actors: DatabaseTableInfo = {
      name: "actors",
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
              localColumnName: "actor_id",
              localSchemaName: "public",
              localTableName: "movie_actors",
              confidence: 1,
              hasForeignKeyConstraint: true,
            },
          ],
        },
      ],
    };
    const movieActors: DatabaseTableInfo = {
      name: "movie_actors",
      columns: [
        {
          name: "movie_id",
          includedInPrimaryKey: true,
          dataType: "number",
          genericDataType: "number" as const,
          isNullable: false,
          foreignKeys: [
            {
              foreignColumnName: "id",
              foreignSchemaName: "public",
              foreignTableName: "movies",
              confidence: 1,
              hasForeignKeyConstraint: true,
            },
          ],
          foreignKeyReferences: [],
        },
        {
          name: "actor_id",
          includedInPrimaryKey: true,
          dataType: "number",
          genericDataType: "number" as const,
          isNullable: false,
          foreignKeys: [
            {
              foreignColumnName: "id",
              foreignSchemaName: "public",
              foreignTableName: "actors",
              confidence: 1,
              hasForeignKeyConstraint: true,
            },
          ],
          foreignKeyReferences: [],
        },
      ],
    };

    const mockRelationships: DatabaseSchema[] = [
      {
        name: "public",
        tables: [movies, actors, movieActors],
      },
    ];

    const relationsForMovies = getRelationsForTable(
      mockRelationships,
      "public",
      "movies",
      1 // maxJoins
    );

    expect(relationsForMovies).toEqual([
      // "actors" is not included because maxJoins is 1
      {
        schemaName: "public",
        tableName: "movie_actors",
        shortestJoinPath: 1,
      },
    ]);
  });
});

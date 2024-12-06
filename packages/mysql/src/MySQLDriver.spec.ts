import { MySqlContainer, type StartedMySqlContainer } from "testcontainers";
import knex, { Knex } from "knex";
import { MySQLDriver } from "./MySQLDriver";
import type { Relationship, TableColumn } from "@quory/core";

describe("MySQLDriver", () => {
  let mysqlContainer: StartedMySqlContainer;
  let db: Knex;
  let driver: MySQLDriver;
  beforeAll(async () => {
    mysqlContainer = await new MySqlContainer("mysql:8.0.32").start();

    db = knex({
      client: "mysql2",
      connection: `mysql://${mysqlContainer.getUsername()}:${mysqlContainer.getUserPassword()}@${mysqlContainer.getHost()}:${mysqlContainer.getPort()}/${mysqlContainer.getDatabase()}`,
    });
  }, 25000);

  beforeEach(async () => {
    await mysqlContainer.executeQuery(
      `DROP database test; CREATE database test;`
    );

    driver = new MySQLDriver({
      host: mysqlContainer.getHost(),
      port: mysqlContainer.getPort(),
      database: mysqlContainer.getDatabase(),
      user: mysqlContainer.getUsername(),
      password: mysqlContainer.getUserPassword(),
    });
  });

  it("Finds all columns in all tables", async () => {
    await db.schema.createTable("makes", (table) => {
      table.bigIncrements("id").primary();
      table.string("name");
    });

    await db.schema.createTable("models", (table) => {
      table.uuid("id").primary();
      table.integer("number_of_doors");
      table.boolean("in_production");
      table.enum("shape", ["hatchback", "saloon", "estate"]);
      table.bigInteger("make_id").unsigned().references("makes.id");
      table.dateTime("launched_at");
    });

    const columns = await driver.getAllColumnsInDatabase();

    expect(columns.sort()).toEqual<TableColumn[]>(
      [
        {
          name: "id",
          tableName: "makes",
          schemaName: "test",
          dataType: "bigint",
          genericDataType: "number",
          isNullable: false,
          includedInPrimaryKey: true,
        },
        {
          name: "name",
          tableName: "makes",
          schemaName: "test",
          dataType: "varchar",
          genericDataType: "text",
          isNullable: true,
          includedInPrimaryKey: false,
        },
        {
          name: "id",
          tableName: "models",
          schemaName: "test",
          dataType: "char",
          genericDataType: "text",
          isNullable: false,
          includedInPrimaryKey: true,
        },
        {
          name: "in_production",
          tableName: "models",
          schemaName: "test",
          dataType: "tinyint",
          genericDataType: "boolean",
          isNullable: true,
          includedInPrimaryKey: false,
        },
        {
          name: "launched_at",
          tableName: "models",
          schemaName: "test",
          dataType: "datetime",
          genericDataType: "datetime",
          isNullable: true,
          includedInPrimaryKey: false,
        },
        {
          name: "make_id",
          tableName: "models",
          schemaName: "test",
          dataType: "bigint",
          genericDataType: "number",
          isNullable: true,
          includedInPrimaryKey: false,
        },
        {
          name: "number_of_doors",
          tableName: "models",
          schemaName: "test",
          dataType: "int",
          genericDataType: "number",
          isNullable: true,
          includedInPrimaryKey: false,
        },
        {
          name: "shape",
          tableName: "models",
          schemaName: "test",
          dataType: "enum",
          genericDataType: "text",
          isNullable: true,
          includedInPrimaryKey: false,
        },
      ].sort() as any
    );
  });

  it("Finds all relationships from foreign keys", async () => {
    await db.schema.createTable("customers", (table) => {
      table.bigIncrements("id").primary();
      table.string("name");
    });

    await db.schema.createTable("orders", (table) => {
      table.uuid("id").primary();
      table.tinyint("status");
      table.bigInteger("customer_id").unsigned().references("customers.id");
      table.dateTime("created_at");
    });

    await db.schema.createTable("order_fulfilment", (table) => {
      table.bigIncrements("id").primary();
      table.uuid("order_id").references("orders.id");
    });

    const relationships = await driver.getAllForeignKeysInDatabase();

    expect(
      relationships.sort((a, b) =>
        JSON.stringify(a).localeCompare(JSON.stringify(b))
      )
    ).toEqual<Relationship[]>([
      {
        localSchema: "test",
        localTable: "order_fulfilment",
        localColumn: "order_id",
        foreignSchema: "test",
        foreignTable: "orders",
        foreignColumn: "id",
      },
      {
        localSchema: "test",
        localTable: "orders",
        localColumn: "customer_id",
        foreignSchema: "test",
        foreignTable: "customers",
        foreignColumn: "id",
      },
    ]);
  });

  afterAll(async () => {
    await mysqlContainer?.stop();
    await db?.destroy();
    await driver?.teardown();
  });
});

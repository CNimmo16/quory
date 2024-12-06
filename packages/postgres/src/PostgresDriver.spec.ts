import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from "testcontainers";
import knex, { Knex } from "knex";
import { PostgresDriver } from "./PostgresDriver";
import type { Relationship, TableColumn } from "@quory/core";

describe("PostgresDriver", () => {
  let postgresContainer: StartedPostgreSqlContainer;
  let db: Knex;
  let driver: PostgresDriver;
  beforeAll(async () => {
    postgresContainer = await new PostgreSqlContainer().start();

    db = knex({
      client: "pg",
      connection: `postgresql://${postgresContainer.getUsername()}:${postgresContainer.getPassword()}@${postgresContainer.getHost()}:${postgresContainer.getPort()}/${postgresContainer.getDatabase()}`,
    });
  }, 25000);

  beforeEach(async () => {
    await db.raw(`
      DROP SCHEMA public CASCADE;
      CREATE SCHEMA public;
    `);

    await driver?.teardown();

    driver = new PostgresDriver({
      host: postgresContainer.getHost(),
      port: postgresContainer.getPort(),
      database: postgresContainer.getDatabase(),
      user: postgresContainer.getUsername(),
      password: postgresContainer.getPassword(),
    });
  });

  it("Finds all columns in all tables", async () => {
    await db.schema.createTable("makes", (table) => {
      table.bigIncrements("id").primary();
      table.string("name");
    });

    await db.schema.createTable("models", (table) => {
      table.uuid("id").primary();
      table.tinyint("number_of_doors");
      table.boolean("in_production");
      table.enum("shape", ["hatchback", "saloon", "estate"]);
      table.bigInteger("make_id").references("makes.id");
      table.dateTime("launched_at");
    });

    const columns = await driver.getAllColumnsInDatabase();

    expect(columns).toEqual<TableColumn[]>([
      {
        name: "launched_at",
        tableName: "models",
        schemaName: "public",
        dataType: "timestamp with time zone",
        genericDataType: "datetime",
        isNullable: true,
        includedInPrimaryKey: false,
      },
      {
        name: "name",
        tableName: "makes",
        schemaName: "public",
        dataType: "character varying",
        genericDataType: "text",
        isNullable: true,
        includedInPrimaryKey: false,
      },
      {
        name: "shape",
        tableName: "models",
        schemaName: "public",
        dataType: "text",
        genericDataType: "text",
        isNullable: true,
        includedInPrimaryKey: false,
      },
      {
        name: "id",
        tableName: "models",
        schemaName: "public",
        dataType: "uuid",
        genericDataType: "text",
        isNullable: false,
        includedInPrimaryKey: true,
      },
      {
        name: "in_production",
        tableName: "models",
        schemaName: "public",
        dataType: "boolean",
        genericDataType: "boolean",
        isNullable: true,
        includedInPrimaryKey: false,
      },
      {
        name: "number_of_doors",
        tableName: "models",
        schemaName: "public",
        dataType: "smallint",
        genericDataType: "number",
        isNullable: true,
        includedInPrimaryKey: false,
      },
      {
        name: "id",
        tableName: "makes",
        schemaName: "public",
        dataType: "bigint",
        genericDataType: "number",
        isNullable: false,
        includedInPrimaryKey: true,
      },
      {
        name: "make_id",
        tableName: "models",
        schemaName: "public",
        dataType: "bigint",
        genericDataType: "number",
        isNullable: true,
        includedInPrimaryKey: false,
      },
    ]);
  });

  it("Finds all relationships from foreign keys", async () => {
    await db.schema.createTable("customers", (table) => {
      table.bigIncrements("id").primary();
      table.string("name");
    });

    await db.schema.createTable("orders", (table) => {
      table.uuid("id").primary();
      table.tinyint("status");
      table.bigInteger("customer_id").references("customers.id");
      table.dateTime("created_at");
    });

    await db.schema.createTable("order_fulfilment", (table) => {
      table.bigIncrements("id").primary();
      table.uuid("order_id").references("orders.id");
    });

    const relationships = await driver.getAllForeignKeysInDatabase();

    expect(relationships).toEqual<Relationship[]>([
      {
        localSchema: "public",
        localTable: "orders",
        localColumn: "customer_id",
        foreignSchema: "public",
        foreignTable: "customers",
        foreignColumn: "id",
      },
      {
        localSchema: "public",
        localTable: "order_fulfilment",
        localColumn: "order_id",
        foreignSchema: "public",
        foreignTable: "orders",
        foreignColumn: "id",
      },
    ]);
  });

  afterAll(async () => {
    await db?.destroy();
    await driver?.teardown();
    await postgresContainer?.stop();
  });
});

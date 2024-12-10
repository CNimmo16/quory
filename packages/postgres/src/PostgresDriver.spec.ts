import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from "testcontainers";
import knex, { Knex } from "knex";
import { PostgresDriver } from "./PostgresDriver";
import type { Relationship, Row, TableColumn } from "@quory/core";

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

  it("Returns exec'd sql in correct format", async () => {
    await db.schema.createTable("customers", (table) => {
      table.bigIncrements("id").primary();
      table.string("name");
    });

    await db.table("customers").insert({ name: "John" });

    await db.schema.createTable("orders", (table) => {
      table.uuid("id").primary();
      table.tinyint("status");
      table.bigInteger("customer_id").references("customers.id");
      table.dateTime("created_at");
    });

    await db.table("orders").insert([
      {
        id: "fa28c1a8-e2ee-4019-a74c-560546226939",
        status: 1,
        customer_id: 1,
        created_at: "2022-01-01T00:00:00.000Z",
      },
      {
        id: "d223bd0c-b1f4-4146-93d1-1e318e567f84",
        status: 2,
        customer_id: 1,
        created_at: "2022-01-05T00:00:00.000Z",
      },
    ]);

    await db.schema.createTable("order_fulfilment", (table) => {
      table.bigIncrements("id").primary();
      table.uuid("order_id").references("orders.id");
    });

    await db.table("order_fulfilment").insert([
      {
        id: 1,
        order_id: "fa28c1a8-e2ee-4019-a74c-560546226939",
      },
      {
        id: 2,
        order_id: "d223bd0c-b1f4-4146-93d1-1e318e567f84",
      },
    ]);

    const rows = await driver.exec(`
      SELECT
        public.customers.id AS public__customers__id,
        public.customers.name AS public__customers__name,
        public.orders.id AS public__orders__id,
        public.orders.status AS public__orders__status,
        public.orders.customer_id AS public__orders__customer_id,
        public.orders.created_at AS public__orders__created_at,
        public.order_fulfilment.id AS public__order_fulfilment__id,
        public.order_fulfilment.order_id AS public__order_fulfilment__order_id
      FROM public.customers
      INNER JOIN public.orders ON public.orders.customer_id = public.customers.id
      INNER JOIN public.order_fulfilment ON public.order_fulfilment.order_id = public.orders.id
    `);

    expect(rows).toEqual<Row[]>([
      {
        public__customers__id: "1",
        public__customers__name: "John",
        public__order_fulfilment__id: "1",
        public__order_fulfilment__order_id:
          "fa28c1a8-e2ee-4019-a74c-560546226939",
        public__orders__created_at: new Date("2022-01-01T00:00:00.000Z"),
        public__orders__customer_id: "1",
        public__orders__id: "fa28c1a8-e2ee-4019-a74c-560546226939",
        public__orders__status: 1,
      },
      {
        public__customers__id: "1",
        public__customers__name: "John",
        public__order_fulfilment__id: "2",
        public__order_fulfilment__order_id:
          "d223bd0c-b1f4-4146-93d1-1e318e567f84",
        public__orders__created_at: new Date("2022-01-05T00:00:00.000Z"),
        public__orders__customer_id: "1",
        public__orders__id: "d223bd0c-b1f4-4146-93d1-1e318e567f84",
        public__orders__status: 2,
      },
    ]);
  });

  afterAll(async () => {
    await db?.destroy();
    await driver?.teardown();
    await postgresContainer?.stop();
  });
});

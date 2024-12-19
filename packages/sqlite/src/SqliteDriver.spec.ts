import knex, { Knex } from "knex";
import { SqliteDriver } from "./SqliteDriver";
import type { Relationship, Row, TableColumn } from "@quory/core";
import sqlite, { Database } from "better-sqlite3";

describe("SqliteDriver", () => {
  let sqliteClient: Database;
  let driver: SqliteDriver;
  let db: Knex;
  beforeEach(async () => {
    sqliteClient = sqlite(":memory:");
    db = knex({
      client: "better-sqlite3",
      connection: {
        filename: ":memory:",
      },
      useNullAsDefault: true,
    });

    driver = new SqliteDriver(sqliteClient);
  });

  const knexCreateTable: (typeof db.schema)["createTable"] = (...args) =>
    db.schema.connection(sqliteClient).createTable(...args);
  // @ts-expect-error it thinks this type is wrong but for our purposes it's right
  const knexTable: (typeof db)["table"] = (tableName: string) =>
    db.table(tableName).connection(sqliteClient);

  it("Finds all columns in all tables", async () => {
    await knexCreateTable("makes", (table) => {
      table.bigIncrements("id").primary();
      table.string("name");
    });

    await knexCreateTable("models", (table) => {
      table.uuid("id").primary();
      table.tinyint("number_of_doors");
      table.boolean("in_production");
      table.enum("shape", ["hatchback", "saloon", "estate"]);
      table.bigInteger("make_id").references("makes.id");
      table.dateTime("launched_at");
    });

    const columns = await driver.getAllColumnsInDatabase();

    columns.sort((a, b) =>
      `${a.tableName}.${a.name}`.localeCompare(`${b.tableName}.${b.name}`)
    );

    expect(columns).toEqual<TableColumn[]>([
      {
        schemaName: "main",
        tableName: "makes",
        name: "id",
        dataType: "INTEGER",
        genericDataType: "number",
        isNullable: false,
        includedInPrimaryKey: true,
      },
      {
        schemaName: "main",
        tableName: "makes",
        name: "name",
        dataType: "varchar(255)",
        genericDataType: "text",
        isNullable: true,
        includedInPrimaryKey: false,
      },
      {
        schemaName: "main",
        tableName: "models",
        name: "id",
        dataType: "char(36)",
        genericDataType: "text",
        isNullable: true,
        includedInPrimaryKey: true,
      },
      {
        schemaName: "main",
        tableName: "models",
        name: "in_production",
        dataType: "boolean",
        genericDataType: "boolean",
        isNullable: true,
        includedInPrimaryKey: false,
      },
      {
        schemaName: "main",
        tableName: "models",
        name: "launched_at",
        dataType: "datetime",
        genericDataType: "datetime",
        isNullable: true,
        includedInPrimaryKey: false,
      },
      {
        schemaName: "main",
        tableName: "models",
        name: "make_id",
        dataType: "bigint",
        genericDataType: "number",
        isNullable: true,
        includedInPrimaryKey: false,
      },
      {
        schemaName: "main",
        tableName: "models",
        name: "number_of_doors",
        dataType: "tinyint",
        genericDataType: "number",
        isNullable: true,
        includedInPrimaryKey: false,
      },
      {
        schemaName: "main",
        tableName: "models",
        name: "shape",
        dataType: "TEXT",
        genericDataType: "text",
        isNullable: true,
        includedInPrimaryKey: false,
      },
    ]);
  });

  it("Finds all relationships from foreign keys", async () => {
    await knexCreateTable("customers", (table) => {
      table.bigIncrements("id").primary();
      table.string("name");
    });

    await knexCreateTable("orders", (table) => {
      table.uuid("id").primary();
      table.tinyint("status");
      table.bigInteger("customer_id").references("customers.id");
      table.dateTime("created_at");
    });

    await knexCreateTable("order_fulfilment", (table) => {
      table.bigIncrements("id").primary();
      table.uuid("order_id").references("orders.id");
    });

    const relationships = await driver.getAllForeignKeysInDatabase();

    expect(relationships).toEqual<Relationship[]>([
      {
        localSchema: "main",
        localTable: "orders",
        localColumn: "customer_id",
        foreignSchema: "main",
        foreignTable: "customers",
        foreignColumn: "id",
      },
      {
        localSchema: "main",
        localTable: "order_fulfilment",
        localColumn: "order_id",
        foreignSchema: "main",
        foreignTable: "orders",
        foreignColumn: "id",
      },
    ]);
  });

  it("Returns exec'd sql in correct format", async () => {
    await knexCreateTable("customers", (table) => {
      table.bigIncrements("id").primary();
      table.string("name");
    });

    await knexTable("customers").insert({ name: "John" });

    await knexCreateTable("orders", (table) => {
      table.uuid("id").primary();
      table.tinyint("status");
      table.bigInteger("customer_id").references("customers.id");
      table.dateTime("created_at");
    });

    await knexTable("orders").insert([
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

    await knexCreateTable("order_fulfilment", (table) => {
      table.bigIncrements("id").primary();
      table.uuid("order_id").references("orders.id");
    });

    await knexTable("order_fulfilment").insert([
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
        main.customers.id AS public__customers__id,
        main.customers.name AS public__customers__name,
        main.orders.id AS public__orders__id,
        main.orders.status AS public__orders__status,
        main.orders.customer_id AS public__orders__customer_id,
        main.orders.created_at AS public__orders__created_at,
        main.order_fulfilment.id AS public__order_fulfilment__id,
        main.order_fulfilment.order_id AS public__order_fulfilment__order_id
      FROM main.customers
      INNER JOIN main.orders ON main.orders.customer_id = main.customers.id
      INNER JOIN main.order_fulfilment ON main.order_fulfilment.order_id = main.orders.id
    `);

    expect(rows).toEqual<Row[]>([
      {
        public__customers__id: 1,
        public__customers__name: "John",
        public__order_fulfilment__id: 1,
        public__order_fulfilment__order_id:
          "fa28c1a8-e2ee-4019-a74c-560546226939",
        public__orders__created_at: "2022-01-01T00:00:00.000Z",
        public__orders__customer_id: 1,
        public__orders__id: "fa28c1a8-e2ee-4019-a74c-560546226939",
        public__orders__status: 1,
      },
      {
        public__customers__id: 1,
        public__customers__name: "John",
        public__order_fulfilment__id: 2,
        public__order_fulfilment__order_id:
          "d223bd0c-b1f4-4146-93d1-1e318e567f84",
        public__orders__created_at: "2022-01-05T00:00:00.000Z",
        public__orders__customer_id: 1,
        public__orders__id: "d223bd0c-b1f4-4146-93d1-1e318e567f84",
        public__orders__status: 2,
      },
    ]);
  });

  afterEach(async () => {
    await db?.destroy();
    await driver?.teardown();
  });
});

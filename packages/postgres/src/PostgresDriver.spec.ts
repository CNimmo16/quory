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

  it("finds composite primary keys for SELECT-only roles without confusing schemas, unique keys or views", async () => {
    await db.raw(`
      CREATE ROLE quory_key_reader LOGIN PASSWORD 'quory_test_reader';
      CREATE SCHEMA key_metadata_test;
      CREATE TABLE public.records (
        tenant_id INTEGER,
        id INTEGER,
        external_id TEXT UNIQUE,
        PRIMARY KEY (tenant_id, id)
      );
      CREATE TABLE key_metadata_test.records (tenant_id INTEGER, id INTEGER UNIQUE);
      CREATE VIEW public.records_view AS SELECT * FROM public.records;
      GRANT USAGE ON SCHEMA public, key_metadata_test TO quory_key_reader;
      GRANT SELECT ON public.records, public.records_view, key_metadata_test.records TO quory_key_reader;
    `);
    const reader = new PostgresDriver({
      host: postgresContainer.getHost(),
      port: postgresContainer.getPort(),
      database: postgresContainer.getDatabase(),
      user: "quory_key_reader",
      password: "quory_test_reader",
    });
    try {
      const constraints = await reader.exec(`
        SELECT constraint_name FROM information_schema.table_constraints
        WHERE table_schema = 'public' AND table_name = 'records'
          AND constraint_type = 'PRIMARY KEY'
      `);
      expect(constraints).toEqual([]);
      const columns = await reader.getAllColumnsInDatabase();
      expect(
        columns
          .filter((column) => column.includedInPrimaryKey)
          .map(
            ({ schemaName, tableName, name }) =>
              `${schemaName}.${tableName}.${name}`
          )
          .sort()
      ).toEqual(["public.records.id", "public.records.tenant_id"]);
      expect(columns).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            schemaName: "public",
            tableName: "records",
            name: "external_id",
            includedInPrimaryKey: false,
          }),
          expect.objectContaining({
            schemaName: "key_metadata_test",
            tableName: "records",
            name: "id",
            includedInPrimaryKey: false,
          }),
          expect.objectContaining({
            schemaName: "public",
            tableName: "records_view",
            name: "id",
            includedInPrimaryKey: false,
          }),
        ])
      );
    } finally {
      await reader.teardown();
      await db.raw(`
        DROP SCHEMA key_metadata_test CASCADE;
        DROP OWNED BY quory_key_reader;
        DROP ROLE quory_key_reader;
      `);
    }
  });

  it("reads schemas containing internal PostgreSQL types without failing", async () => {
    await db.schema.createTable("metadata", (table) => {
      table.specificType("object_name", "name");
      table.specificType("object_id", "oid");
    });

    const columns = await driver.getAllColumnsInDatabase();

    expect(columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "object_name",
          dataType: "name",
          genericDataType: "text",
        }),
        expect.objectContaining({
          name: "object_id",
          dataType: "oid",
          genericDataType: "other",
        }),
      ])
    );
  });

  it("preserves ordered composite pairs and parallel constraint identity", async () => {
    await db.raw(`
      CREATE TABLE parents (tenant_id INTEGER, id INTEGER, PRIMARY KEY (tenant_id, id));
    `);
    await db.raw(`
      CREATE TABLE children (tenant_id INTEGER, parent_id INTEGER, other_parent_id INTEGER,
        CONSTRAINT primary_parent FOREIGN KEY (tenant_id, parent_id) REFERENCES parents(tenant_id, id),
        CONSTRAINT other_parent FOREIGN KEY (tenant_id, other_parent_id) REFERENCES parents(tenant_id, id));
    `);
    const relationships = await driver.getAllForeignKeysInDatabase();
    for (const [constraintId, localColumn] of [
      ["primary_parent", "parent_id"],
      ["other_parent", "other_parent_id"],
    ]) {
      expect(
        relationships
          .filter((ref) => ref.constraintId === constraintId)
          .sort((a, b) => a.columnPosition! - b.columnPosition!)
      ).toEqual([
        {
          constraintId,
          columnPosition: 1,
          localSchema: "public",
          localTable: "children",
          localColumn: "tenant_id",
          foreignSchema: "public",
          foreignTable: "parents",
          foreignColumn: "tenant_id",
        },
        {
          constraintId,
          columnPosition: 2,
          localSchema: "public",
          localTable: "children",
          localColumn,
          foreignSchema: "public",
          foreignTable: "parents",
          foreignColumn: "id",
        },
      ]);
    }
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

    expect(
      relationships.sort((a, b) => b.localTable.localeCompare(a.localTable))
    ).toEqual<Relationship[]>([
      {
        localSchema: "public",
        constraintId: "orders_customer_id_foreign",
        columnPosition: 1,
        localTable: "orders",
        localColumn: "customer_id",
        foreignSchema: "public",
        foreignTable: "customers",
        foreignColumn: "id",
      },
      {
        localSchema: "public",
        constraintId: "order_fulfilment_order_id_foreign",
        columnPosition: 1,
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

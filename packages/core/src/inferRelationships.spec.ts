import { afterEach, describe, expect, it, vi } from "vitest";
import sqlite from "better-sqlite3";
import { SqliteDriver } from "../../sqlite/src/SqliteDriver";
import {
  getSchemas,
  inferRelationships,
  prepareQuery,
  runQuery,
  getCountForQuery,
  getTableRelationships,
  type TableColumn,
  type Relationship,
  type Query,
} from ".";

const column = (
  tableName: string,
  name: string,
  primary = false,
  dataType = "integer",
  schemaName = "public",
): TableColumn => ({
  tableName,
  schemaName,
  name,
  dataType,
  genericDataType:
    dataType === "text" || dataType === "uuid" ? "text" : "number",
  includedInPrimaryKey: primary,
  isNullable: false,
});
const columns = () => [
  column("version_images", "pkey", true),
  column("versions", "pkey", true),
  column("versions", "version_image_pkey"),
];
const databases: sqlite.Database[] = [];
afterEach(() => databases.splice(0).forEach((db) => db.close()));
function database(sql: string) {
  const db = sqlite(":memory:");
  databases.push(db);
  db.exec(sql);
  return new SqliteDriver(db);
}

describe("relationship inference", () => {
  it("matches complete multiword singular and literal table names against actual primary keys", () => {
    const result = inferRelationships([
      ...columns(),
      column("versions", "version_images_pkey"),
      column("versions", "image_pkey"),
      column("versions", "archived_version_image_pkey"),
    ]);
    expect(result.map((key) => key.localColumn)).toEqual([
      "version_image_pkey",
      "version_images_pkey",
    ]);
    expect(result[0]).toMatchObject({
      localTable: "versions",
      foreignTable: "version_images",
      foreignColumn: "pkey",
      source: "inferred",
      confidence: 0.9,
      columnPosition: 1,
    });
    expect(result[1]!.confidence).toBe(0.95);
    expect(inferRelationships(columns().reverse())[0]!.constraintId).toBe(
      result[0]!.constraintId,
    );
  });
  it("can disable plural conversion while preserving literal table matches", () => {
    expect(
      inferRelationships(columns(), [], { pluralConversion: false }),
    ).toEqual([]);
    expect(
      inferRelationships(
        [...columns(), column("versions", "version_images_pkey")],
        [],
        { pluralConversion: false },
      ),
    ).toHaveLength(1);
  });
  it("does not infer non-primary, incomplete composite or absent keys", () => {
    expect(
      inferRelationships([
        ...columns(),
        column("version_images", "tenant", true),
      ]),
    ).toEqual([]);
    expect(
      inferRelationships(
        columns().map((key) => ({ ...key, includedInPrimaryKey: false })),
      ),
    ).toEqual([]);
  });
  it("requires compatible types and can require identical database type strings", () => {
    const compatible = columns().map((key) =>
      key.name === "version_image_pkey" ? { ...key, dataType: "bigint" } : key,
    );
    expect(inferRelationships(compatible)[0]!.confidence).toBe(0.85);
    expect(
      inferRelationships(compatible, [], { identicalDataTypesOnly: true }),
    ).toEqual([]);
    expect(
      inferRelationships([
        column("users", "id", true, "VARCHAR(32)"),
        column("orders", "user_id", false, "TEXT"),
      ]),
    ).toHaveLength(1);
    expect(
      inferRelationships(
        columns().map((key) =>
          key.name === "version_image_pkey"
            ? { ...key, dataType: "text" }
            : key,
        ),
      ),
    ).toEqual([]);
    expect(
      inferRelationships([
        column("users", "id", true, "uuid"),
        column("orders", "user_id", false, "text"),
      ]),
    ).toEqual([]);
    for (const type of ["ARRAY", "USER-DEFINED", "enum", ""])
      expect(
        inferRelationships([
          column("users", "id", true, type),
          column("orders", "user_id", false, type),
        ]),
      ).toEqual([]);
  });
  it("stays within a schema by default and treats all cross-schema candidates equally", () => {
    const cross = columns().map((key) =>
      key.tableName === "version_images"
        ? { ...key, schemaName: "assets" }
        : key,
    );
    expect(inferRelationships(cross)).toEqual([]);
    expect(inferRelationships(cross, [], { crossSchema: true })).toHaveLength(
      1,
    );
    const ambiguous = [
      ...columns(),
      column("version_images", "pkey", true, "integer", "assets"),
    ];
    expect(inferRelationships(ambiguous)).toHaveLength(1);
    expect(inferRelationships(ambiguous, [], { crossSchema: true })).toEqual(
      [],
    );
    expect(() =>
      inferRelationships(ambiguous, [], {
        crossSchema: true,
        multipleCandidateBehaviour: "error",
      }),
    ).toThrow(
      /Ambiguous.*versions.version_image_pkey.*assets.version_images.pkey.*public.version_images.pkey/,
    );
  });
  it("only counts compatible destinations when resolving ambiguity", () => {
    const input = [...columns(), column("version_image", "pkey", true, "text")];
    expect(
      inferRelationships(input, [], { multipleCandidateBehaviour: "error" }),
    ).toHaveLength(1);
    expect(
      inferRelationships([...columns(), column("version_image", "pkey", true)]),
    ).toEqual([]);
  });
  it("does not create a competing inference for a column covered by a declared constraint", () => {
    const existing: Relationship = {
      localSchema: "public",
      localTable: "versions",
      localColumn: "version_image_pkey",
      foreignSchema: "public",
      foreignTable: "other",
      foreignColumn: "id",
    };
    expect(inferRelationships(columns(), [existing])).toEqual([]);
  });
});

describe("configured relationship queries", () => {
  function fixture() {
    return database(
      `CREATE TABLE version_images(pkey INTEGER PRIMARY KEY, name TEXT); CREATE TABLE versions(pkey INTEGER PRIMARY KEY, version_image_pkey INTEGER); INSERT INTO version_images VALUES(7, 'cover'); INSERT INTO versions VALUES(1, 7), (2, 999), (3, NULL);`,
    );
  }
  const query: Query = {
    base: {
      tableRef: "main.versions",
      select: ["pkey"],
      joins: [{ tableRef: "main.version_images", select: ["name"] }],
    },
  };
  it("keeps inference off unless true or an options object is supplied", async () => {
    const driver = fixture();
    const initial = await getSchemas(driver);
    expect(
      initial[0]!.tables.every((table) =>
        table.columns.every(
          (key) => !key.foreignKeys.length && !key.foreignKeyReferences.length,
        ),
      ),
    ).toBe(true);
    expect(await getSchemas(driver, { inferRelationships: false })).toEqual(
      initial,
    );
    for (const infer of [true, {}]) {
      const schemas = await getSchemas(driver, { inferRelationships: infer });
      const versions = schemas[0]!.tables.find(
        (table) => table.name === "versions",
      )!;
      expect(getTableRelationships(versions, "main")[0]).toMatchObject({
        source: "inferred",
        confidence: 0.9,
      });
      expect(versions.columns[1]!.foreignKeys[0]!.hasForeignKeyConstraint).toBe(
        false,
      );
      expect(
        (await runQuery(driver, schemas, query)).rows.map((row) =>
          row.map((join) => join.data),
        ),
      ).toEqual([[{ pkey: 1 }, { name: "cover" }]]);
      expect((await getCountForQuery(driver, schemas, query)).count).toBe(1);
    }
  });
  it("filters confidence in both directions before planning, including explicitly selected edges", async () => {
    const driver = fixture();
    const schemas = await getSchemas(driver, { inferRelationships: true });
    const reverse: Query = {
      base: {
        tableRef: "main.version_images",
        select: ["pkey"],
        joins: [{ tableRef: "main.versions", select: ["pkey"] }],
      },
    };
    const exec = vi.spyOn(driver, "exec");
    for (const next of [
      query,
      reverse,
      {
        base: {
          ...query.base,
          joins: [
            {
              ...query.base.joins![0]!,
              via: [
                {
                  tableRef: "main.version_images",
                  fromColumnName: "version_image_pkey",
                },
              ],
            },
          ],
        },
      },
    ]) {
      await expect(
        prepareQuery(schemas, next, "sqlite", {
          minimumRelationshipConfidence: 0.9,
        }),
      ).resolves.toBeDefined();
      await expect(
        prepareQuery(schemas, next, "sqlite", {
          minimumRelationshipConfidence: 0.91,
        }),
      ).rejects.toThrow(/path|relationship/i);
      await expect(
        runQuery(driver, schemas, next, {
          minimumRelationshipConfidence: 0.91,
        }),
      ).rejects.toThrow();
      await expect(
        getCountForQuery(driver, schemas, next, {
          minimumRelationshipConfidence: 0.91,
        }),
      ).rejects.toThrow();
    }
    expect(exec).not.toHaveBeenCalled();
    for (const minimum of [-1, 2, NaN])
      await expect(
        prepareQuery(schemas, query, "sqlite", {
          minimumRelationshipConfidence: minimum,
        }),
      ).rejects.toThrow("between 0 and 1");
  });
  it("persists exclusions by stable ID in both directions without mutating discovered metadata", async () => {
    const driver = fixture();
    const before = await getSchemas(driver, { inferRelationships: true });
    const key = before[0]!.tables.find((table) => table.name === "versions")!
      .columns[1]!.foreignKeys[0]!;
    const excluded = await getSchemas(driver, {
      inferRelationships: true,
      excludedRelationships: [key.constraintId!],
    });
    expect(
      excluded[0]!.tables.every((table) =>
        table.columns.every(
          (field) =>
            !field.foreignKeys.length && !field.foreignKeyReferences.length,
        ),
      ),
    ).toBe(true);
    await expect(prepareQuery(excluded, query)).rejects.toThrow("path");
    expect(await getSchemas(driver, { inferRelationships: true })).toEqual(
      before,
    );
  });
  it("uses a shorter inferred path even when a longer declared path exists", async () => {
    const driver = database(
      `CREATE TABLE images(pkey INTEGER PRIMARY KEY); CREATE TABLE links(id INTEGER PRIMARY KEY, image INTEGER REFERENCES images(pkey)); CREATE TABLE versions(id INTEGER PRIMARY KEY, link INTEGER REFERENCES links(id), image_pkey INTEGER);`,
    );
    const schemas = await getSchemas(driver, { inferRelationships: true });
    const result = await prepareQuery(schemas, {
      base: {
        tableRef: "main.versions",
        select: ["id"],
        joins: [{ tableRef: "main.images", select: ["pkey"] }],
      },
    });
    expect(result.preparedQuery.base.joins[0]!.tableRef).toBe("main.images");
    expect(result.sql).toContain('"image_pkey"');
    expect(result.sql).not.toContain('JOIN "main"."links"');
  });
  it("supports manual composite relationships and rejects partial, missing or incompatible pairs", async () => {
    const driver = database(
      `CREATE TABLE parents(tenant INTEGER, id INTEGER, PRIMARY KEY(tenant, id)); CREATE TABLE children(pkey INTEGER PRIMARY KEY, account INTEGER, parent INTEGER, wrong TEXT); INSERT INTO parents VALUES(1, 7), (2, 7); INSERT INTO children VALUES(1, 1, 7, 'x');`,
    );
    const relationship = {
      constraintId: "manual:parent",
      localSchema: "main",
      localTable: "children",
      foreignSchema: "main",
      foreignTable: "parents",
      columnPairs: [
        { localColumn: "account", foreignColumn: "tenant" },
        { localColumn: "parent", foreignColumn: "id" },
      ],
    };
    const schemas = await getSchemas(driver, { relationships: [relationship] });
    expect(
      getTableRelationships(
        schemas[0]!.tables.find((table) => table.name === "children")!,
        "main",
      )[0]!.columnPairs,
    ).toEqual(relationship.columnPairs);
    const joined: Query = {
      base: {
        tableRef: "main.children",
        select: ["pkey"],
        joins: [{ tableRef: "main.parents", select: ["tenant", "id"] }],
      },
    };
    expect((await getCountForQuery(driver, schemas, joined)).count).toBe(1);
    for (const pairs of [
      relationship.columnPairs.slice(1),
      [
        { localColumn: "wrong", foreignColumn: "tenant" },
        relationship.columnPairs[1]!,
      ],
      [
        { localColumn: "missing", foreignColumn: "tenant" },
        relationship.columnPairs[1]!,
      ],
    ])
      await expect(
        getSchemas(driver, {
          relationships: [{ ...relationship, columnPairs: pairs }],
        }),
      ).rejects.toThrow(/primary key|incompatible/);
  });
});

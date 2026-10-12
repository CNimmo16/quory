import { quoteIdentifier } from "@quory/core";
import type {
  DatabaseDriver,
  SqlParameter,
  Relationship,
  Row,
  TableColumn,
} from "@quory/core";
import sqliteAffinityToGenericDatatype from "./util/sqliteAffinityToGenericDatatype";
import sqlite, { Database } from "better-sqlite3";
import getAffinityForType from "./util/getAffinityForType";

export class SqliteDriver implements DatabaseDriver {
  readonly dialect = "sqlite" as const;
  db: Database;

  constructor(filenameOrClient: string, options: sqlite.Options);
  constructor(filenameOrClient: Database);
  constructor(filenameOrClient: string | Database, options?: sqlite.Options) {
    if (!filenameOrClient) {
      throw new Error("No filename or client provided");
    }
    if (typeof filenameOrClient === "string") {
      this.db = sqlite(filenameOrClient, options);
    } else {
      this.db = filenameOrClient;
    }
    this.db.pragma("journal_mode = WAL");
  }

  async testConnection() {
    await this.db.prepare("SELECT 1").get();
  }

  async exec(sql: string, parameters: SqlParameter[] = []): Promise<Row[]> {
    const rows = this.db.prepare(sql).all(...parameters);
    return rows as Row[];
  }

  async getAllColumnsInDatabase(): Promise<TableColumn[]> {
    const columns = (
      this.db.prepare("PRAGMA database_list;").all() as { name: string }[]
    ).flatMap((schema) => {
      return (
        this.db
          .prepare(
            `SELECT * FROM ${quoteIdentifier(
              schema.name,
              "sqlite"
            )}.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';`
          )
          .all() as { name: string }[]
      ).flatMap((table) => {
        return (
          this.db
            .prepare(
              `PRAGMA ${quoteIdentifier(
                schema.name,
                "sqlite"
              )}.table_info(${quoteIdentifier(table.name, "sqlite")});`
            )
            .all() as {
            name: string;
            type: string;
            pk: number;
            notnull: 1 | 0;
            dflt_value: string | null;
          }[]
        ).map((column): TableColumn => {
          const dataType = column.type;
          const typeRes = this.db
            .prepare(
              `SELECT typeof(${quoteIdentifier(
                column.name,
                "sqlite"
              )}) FROM ${quoteIdentifier(
                schema.name,
                "sqlite"
              )}.${quoteIdentifier(table.name, "sqlite")};`
            )
            .get() as { [key: string]: string } | null;
          const affinity = getAffinityForType(
            typeRes ? Object.values(typeRes)[0]! : column.type
          );
          return {
            schemaName: schema.name,
            tableName: table.name,
            name: column.name,
            dataType,
            genericDataType: sqliteAffinityToGenericDatatype(affinity),
            isNullable: column.notnull === 0,
            includedInPrimaryKey: column.pk > 0,
          };
        });
      });
    });

    return columns;
  }

  async getAllForeignKeysInDatabase(): Promise<Relationship[]> {
    const foreignKeys = (
      this.db.prepare("PRAGMA database_list;").all() as { name: string }[]
    ).flatMap((schema) => {
      return (
        this.db
          .prepare(
            `SELECT * FROM ${quoteIdentifier(
              schema.name,
              "sqlite"
            )}.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';`
          )
          .all() as { name: string }[]
      ).flatMap((table) => {
        return (
          this.db
            .prepare(
              `PRAGMA ${quoteIdentifier(
                schema.name,
                "sqlite"
              )}.foreign_key_list(${quoteIdentifier(table.name, "sqlite")});`
            )
            .all() as {
            id: number;
            seq: number;
            table: string;
            from: string;
            to: string | null;
            on_update: string;
            on_delete: string;
          }[]
        ).map(
          (fk): Relationship => ({
            constraintId: String(fk.id),
            columnPosition: fk.seq + 1,
            localSchema: schema.name,
            localTable: table.name,
            localColumn: fk.from,
            foreignSchema: schema.name,
            foreignTable: fk.table,
            foreignColumn:
              fk.to ??
              (
                this.db
                  .prepare(
                    `PRAGMA ${quoteIdentifier(
                      schema.name,
                      "sqlite"
                    )}.table_info(${quoteIdentifier(fk.table, "sqlite")});`
                  )
                  .all() as { name: string; pk: number }[]
              ).find((column) => column.pk === fk.seq + 1)!.name,
          })
        );
      });
    });
    return foreignKeys;
  }

  async teardown() {
    await this.db.close();
  }
}

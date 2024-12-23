import type {
  DatabaseDriver,
  Relationship,
  Row,
  TableColumn,
} from "@quory/core";
import sqliteAffinityToGenericDatatype from "./util/sqliteAffinityToGenericDatatype";
import sqlite, { Database } from "better-sqlite3";
import getAffinityForType from "./util/getAffinityForType";

export class SqliteDriver implements DatabaseDriver {
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

  async exec(sql: string): Promise<Row[]> {
    const rows = this.db.prepare(sql).all();
    return rows as Row[];
  }

  async getAllColumnsInDatabase(): Promise<TableColumn[]> {
    const columns = (
      this.db.prepare("PRAGMA database_list;").all() as { name: string }[]
    ).flatMap((schema) => {
      return (
        this.db
          .prepare(
            `SELECT * FROM ${schema.name}.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';`
          )
          .all() as { name: string }[]
      ).flatMap((table) => {
        return (
          this.db.prepare(`PRAGMA table_info('${table.name}');`).all() as {
            name: string;
            type: string;
            pk: 1 | 0;
            notnull: 1 | 0;
            dflt_value: string | null;
          }[]
        ).map((column): TableColumn => {
          const dataType = column.type;
          const typeRes = this.db
            .prepare(`SELECT typeof(${column.name}) FROM ${table.name};`)
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
            includedInPrimaryKey: column.pk === 1,
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
            `SELECT * FROM ${schema.name}.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';`
          )
          .all() as { name: string }[]
      ).flatMap((table) => {
        return (
          this.db
            .prepare(`PRAGMA foreign_key_list('${table.name}');`)
            .all() as {
            id: number;
            sq: number;
            table: string;
            from: string;
            to: string;
            on_update: string;
            on_delete: string;
          }[]
        ).map(
          (fk): Relationship => ({
            localSchema: schema.name,
            localTable: table.name,
            localColumn: fk.from,
            foreignSchema: schema.name,
            foreignTable: fk.table,
            foreignColumn: fk.to,
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

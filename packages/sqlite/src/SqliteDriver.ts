import type {
  DatabaseDriver,
  Relationship,
  Row,
  TableColumn,
} from "@quory/core";
import sqliteDatatypeToGenericDatatype from "./util/sqliteDatatypeToGenericDatatype";
import sqlite, { Database } from "better-sqlite3";

export class SqliteDriver implements DatabaseDriver {
  db: Database;

  constructor(filenameOrClient: string, options: sqlite.Options);
  constructor(filenameOrClient: Database);
  constructor(filenameOrClient: string | Database, options?: sqlite.Options) {
    if (filenameOrClient instanceof sqlite) {
      this.db = filenameOrClient;
    } else {
      this.db = sqlite(filenameOrClient, options);
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
        ).map(
          (column): TableColumn => ({
            schemaName: schema.name,
            tableName: table.name,
            name: column.name,
            dataType: column.type,
            genericDataType: sqliteDatatypeToGenericDatatype(column.type),
            isNullable: column.notnull === 0,
            includedInPrimaryKey: column.pk === 1,
          })
        );
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

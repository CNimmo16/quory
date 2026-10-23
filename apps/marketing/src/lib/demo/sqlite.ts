import type {
  DatabaseDriver,
  ExecutionOptions,
  Relationship,
  Row,
  SqlParameter,
  TableColumn,
} from "@quory/core";
import type { BrowserSqlite, SqlValue } from "./database";

export interface SqliteDatabase {
  run(sql: string, parameters?: SqlValue[]): void;
  prepare(sql: string): {
    bind(parameters: SqlValue[]): void;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    free(): void;
  };
  export(): Uint8Array;
  close(): void;
}
export type SqliteModule = { Database: new () => SqliteDatabase };
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

/** All access happens inside the demo worker; statements are always finalized. */
export class BrowserSqliteDriver implements DatabaseDriver, BrowserSqlite {
  readonly dialect = "sqlite" as const;
  constructor(readonly db: SqliteDatabase) {}
  run(sql: string, parameters: SqlValue[] = []) {
    this.db.run(sql, parameters);
  }
  rows(sql: string, parameters: SqlValue[] = []) {
    const statement = this.db.prepare(sql);
    try {
      statement.bind(parameters);
      const rows: Record<string, unknown>[] = [];
      while (statement.step()) rows.push(statement.getAsObject());
      return rows;
    } finally {
      statement.free();
    }
  }
  async exec(
    sql: string,
    parameters: SqlParameter[] = [],
    options?: ExecutionOptions,
  ) {
    options?.signal?.throwIfAborted();
    return this.rows(sql, parameters as SqlValue[]) as Row[];
  }
  async testConnection() {
    this.rows("SELECT 1");
  }
  private tables() {
    return this.rows(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    );
  }
  async getAllColumnsInDatabase(): Promise<TableColumn[]> {
    return this.tables().flatMap((table) =>
      this.rows(`PRAGMA table_info(${quote(String(table.name))})`).map((c) => ({
        schemaName: "main",
        tableName: String(table.name),
        name: String(c.name),
        dataType: String(c.type),
        genericDataType: /INT|REAL|FLOAT|NUM|DOUBLE/i.test(String(c.type))
          ? ("number" as const)
          : ("text" as const),
        isNullable: !c.notnull,
        includedInPrimaryKey: Number(c.pk) > 0,
      })),
    );
  }
  async getAllForeignKeysInDatabase(): Promise<Relationship[]> {
    return this.tables().flatMap((table) =>
      this.rows(`PRAGMA foreign_key_list(${quote(String(table.name))})`).map(
        (fk) => ({
          constraintId: String(fk.id),
          columnPosition: Number(fk.seq) + 1,
          localSchema: "main",
          localTable: String(table.name),
          localColumn: String(fk.from),
          foreignSchema: "main",
          foreignTable: String(fk.table),
          foreignColumn: String(fk.to),
        }),
      ),
    );
  }
  private closed = false;
  async teardown() {
    if (!this.closed) {
      this.closed = true;
      this.db.close();
    }
  }
}

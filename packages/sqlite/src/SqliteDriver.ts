import { quoteIdentifier } from "@quory/core";
import type {
  DatabaseDriver,
  SqlExecutionOptions,
  SqlExecutionResult,
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
    try {
      if (!this.db.readonly) this.db.pragma("journal_mode = WAL");
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  async testConnection() {
    await this.db.prepare("SELECT 1").get();
  }

  async exec(sql: string, parameters: SqlParameter[] = []): Promise<Row[]> {
    const rows = this.db.prepare(sql).all(...parameters);
    return rows as Row[];
  }

  async execSql(
    sql: string,
    parameters: SqlParameter[],
    options: SqlExecutionOptions,
  ): Promise<SqlExecutionResult> {
    options.signal?.throwIfAborted();
    const previouslyReadOnly = this.db.pragma("query_only", { simple: true });
    if (options.readOnly) this.db.pragma("query_only = ON");
    try {
      return this.db.transaction(() => {
        const statement = this.db.prepare(sql).safeIntegers(true);
        if (options.readOnly && !statement.readonly)
          throw new Error("This statement cannot run in read-only mode.");
        if (statement.reader) {
          const rows: unknown[][] = [];
          let truncated = false;
          for (const row of statement.raw().iterate(...parameters)) {
            if (rows.length === 1000) {
              truncated = true;
              break;
            }
            rows.push(
              (row as unknown[]).map((value) =>
                typeof value === "bigint" &&
                value <= BigInt(Number.MAX_SAFE_INTEGER) &&
                value >= BigInt(Number.MIN_SAFE_INTEGER)
                  ? Number(value)
                  : value,
              ),
            );
          }
          return {
            columns: statement.columns().map((column) => column.name),
            rows,
            affectedRows: statement.readonly
              ? null
              : (
                  this.db.prepare("SELECT changes() AS count").get() as {
                    count: number;
                  }
                ).count,
            truncated,
          };
        }
        const result = statement.run(...parameters);
        return {
          columns: [],
          rows: [],
          affectedRows: result.changes,
          truncated: false,
        };
      })();
    } finally {
      if (options.readOnly && !previouslyReadOnly)
        this.db.pragma("query_only = OFF");
    }
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
              "sqlite",
            )}.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';`,
          )
          .all() as { name: string }[]
      ).flatMap((table) => {
        return (
          this.db
            .prepare(
              `PRAGMA ${quoteIdentifier(
                schema.name,
                "sqlite",
              )}.table_info(${quoteIdentifier(table.name, "sqlite")});`,
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
                "sqlite",
              )}) FROM ${quoteIdentifier(
                schema.name,
                "sqlite",
              )}.${quoteIdentifier(table.name, "sqlite")};`,
            )
            .get() as { [key: string]: string } | null;
          const affinity = getAffinityForType(
            typeRes ? Object.values(typeRes)[0]! : column.type,
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
              "sqlite",
            )}.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';`,
          )
          .all() as { name: string }[]
      ).flatMap((table) => {
        return (
          this.db
            .prepare(
              `PRAGMA ${quoteIdentifier(
                schema.name,
                "sqlite",
              )}.foreign_key_list(${quoteIdentifier(table.name, "sqlite")});`,
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
        ).map((fk): Relationship => ({
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
                    "sqlite",
                  )}.table_info(${quoteIdentifier(fk.table, "sqlite")});`,
                )
                .all() as { name: string; pk: number }[]
            ).find((column) => column.pk === fk.seq + 1)!.name,
        }));
      });
    });
    return foreignKeys;
  }

  private teardownPromise?: Promise<void>;

  teardown(): Promise<void> {
    return (this.teardownPromise ??= Promise.resolve().then(async () => {
      await this.db.close();
    }));
  }
}

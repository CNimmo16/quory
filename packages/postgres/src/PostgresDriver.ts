import postgres from "postgres";
import type {
  DatabaseDriver,
  SqlExecutionOptions,
  SqlExecutionResult,
  ExecutionOptions,
  SqlParameter,
  Relationship,
  Row,
  TableColumn,
} from "@quory/core";
import postgresDatatypeToGenericDatatype from "./util/postgresDatatypeToGenericDatatype";

export class PostgresDriver implements DatabaseDriver {
  readonly dialect = "postgres" as const;
  sql: postgres.Sql;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private config: postgres.Options<Record<string, any>>) {
    this.sql = postgres(config);
  }

  async testConnection() {
    await this.sql`SELECT 1`;
  }

  async exec(
    sql: string,
    parameters: SqlParameter[] = [],
    options: ExecutionOptions = {},
  ): Promise<Row[]> {
    options.signal?.throwIfAborted();
    const query = this.sql.unsafe(sql, parameters);
    const abort = () => {
      query.cancel();
    };
    options.signal?.addEventListener("abort", abort, { once: true });
    try {
      return await query;
    } finally {
      options.signal?.removeEventListener("abort", abort);
    }
  }

  async execSql(
    sql: string,
    parameters: SqlParameter[],
    options: SqlExecutionOptions,
  ): Promise<SqlExecutionResult> {
    options.signal?.throwIfAborted();
    const isolated = postgres({ ...this.config, max: 1, connect_timeout: 15 });
    try {
      return await isolated.begin(
        options.readOnly ? "READ ONLY" : "",
        async (transaction) => {
          options.signal?.throwIfAborted();
          const query = transaction
            .unsafe(sql, parameters, { prepare: true })
            .values();
          const abort = () => query.cancel();
          options.signal?.addEventListener("abort", abort, { once: true });
          try {
            options.signal?.throwIfAborted();
            const rows = await query;
            options.signal?.throwIfAborted();
            return {
              columns: rows.columns.map((column) => column.name),
              rows: Array.from(rows).slice(0, 1000),
              affectedRows: [
                "INSERT",
                "UPDATE",
                "DELETE",
                "MERGE",
                "COPY",
              ].includes(rows.command)
                ? rows.count
                : null,
              truncated: rows.length > 1000,
            };
          } finally {
            options.signal?.removeEventListener("abort", abort);
          }
        },
      );
    } finally {
      await isolated.end({ timeout: 1 });
    }
  }

  async getAllColumnsInDatabase(): Promise<TableColumn[]> {
    // information_schema.table_constraints hides keys from SELECT-only roles.
    // Keep its column access filtering, but discover primary keys from pg_catalog.
    const columns = await this.sql`
    SELECT
    table_name,
    table_schema,
    column_name,
    is_nullable,
    data_type,
    pk.column_name IS NOT NULL AS is_primary_key

    FROM information_schema.columns
    LEFT JOIN (
      SELECT
      ns.nspname AS table_schema,
      tbl.relname AS table_name,
      attr.attname AS column_name
      FROM pg_catalog.pg_constraint AS con
      JOIN pg_catalog.pg_class AS tbl ON tbl.oid = con.conrelid
      JOIN pg_catalog.pg_namespace AS ns ON ns.oid = tbl.relnamespace
      JOIN pg_catalog.pg_attribute AS attr
        ON attr.attrelid = con.conrelid AND attr.attnum = ANY(con.conkey)
      WHERE con.contype = 'p'
    ) AS pk
    USING (table_schema, table_name, column_name)

    WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
    `;

    return columns.map((columnInfo) => ({
      name: columnInfo.column_name,
      tableName: columnInfo.table_name,
      schemaName: columnInfo.table_schema,
      dataType: columnInfo.data_type,
      genericDataType: postgresDatatypeToGenericDatatype(columnInfo.data_type),
      isNullable: columnInfo.is_nullable === "YES",
      includedInPrimaryKey: columnInfo.is_primary_key,
    }));
  }

  async getAllForeignKeysInDatabase(): Promise<Relationship[]> {
    const foreignKeys = await this.sql`
    SELECT
      ns.nspname AS table_schema,
      con.conname AS constraint_name,
      local_table.relname AS table_name,
      local_column.attname AS column_name,
      pair.ordinality AS ordinal_position,
      foreign_ns.nspname AS foreign_table_schema,
      foreign_table.relname AS foreign_table_name,
      foreign_column.attname AS foreign_column_name
    FROM pg_catalog.pg_constraint AS con
    JOIN pg_catalog.pg_class AS local_table ON local_table.oid = con.conrelid
    JOIN pg_catalog.pg_namespace AS ns ON ns.oid = local_table.relnamespace
    JOIN pg_catalog.pg_class AS foreign_table ON foreign_table.oid = con.confrelid
    JOIN pg_catalog.pg_namespace AS foreign_ns ON foreign_ns.oid = foreign_table.relnamespace
    CROSS JOIN LATERAL unnest(con.conkey, con.confkey) WITH ORDINALITY
      AS pair(local_attnum, foreign_attnum, ordinality)
    JOIN pg_catalog.pg_attribute AS local_column
      ON local_column.attrelid = con.conrelid AND local_column.attnum = pair.local_attnum
    JOIN pg_catalog.pg_attribute AS foreign_column
      ON foreign_column.attrelid = con.confrelid AND foreign_column.attnum = pair.foreign_attnum
    WHERE con.contype = 'f' AND ns.nspname NOT IN ('information_schema', 'pg_catalog')
    ORDER BY ns.nspname, local_table.relname, con.conname, pair.ordinality;
    `;

    return foreignKeys.map((constraintInfo) => ({
      constraintId: constraintInfo.constraint_name,
      columnPosition: Number(constraintInfo.ordinal_position),
      localSchema: constraintInfo.table_schema,
      localTable: constraintInfo.table_name,
      localColumn: constraintInfo.column_name,
      foreignSchema: constraintInfo.foreign_table_schema,
      foreignTable: constraintInfo.foreign_table_name,
      foreignColumn: constraintInfo.foreign_column_name,
    }));
  }

  private teardownPromise?: Promise<void>;

  teardown(): Promise<void> {
    return (this.teardownPromise ??= Promise.resolve().then(async () => {
      await this.sql.end();
    }));
  }
}

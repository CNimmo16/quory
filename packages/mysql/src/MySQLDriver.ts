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
import mysqlDatatypeToGenericDatatype from "./util/mysqlDatatypeToGenericDatatype";
import mysql, {
  Pool,
  PoolOptions,
  RowDataPacket,
  ResultSetHeader,
} from "mysql2/promise";
import { sortBy, uniqBy } from "lodash";

export class MySQLDriver implements DatabaseDriver {
  readonly dialect = "mysql" as const;
  pool: Pool;
  constructor(poolConfig: PoolOptions) {
    this.pool = mysql.createPool(poolConfig);
  }

  async testConnection() {
    await this.pool.query("SELECT 1");
  }

  async exec(
    sql: string,
    parameters: SqlParameter[] = [],
    options: ExecutionOptions = {},
  ): Promise<Row[]> {
    options.signal?.throwIfAborted();
    const connection = await this.pool.getConnection();
    const abort = () => connection.destroy();
    options.signal?.addEventListener("abort", abort, { once: true });
    try {
      options.signal?.throwIfAborted();
      const [rows] = await connection.execute<RowDataPacket[]>(sql, parameters);
      return rows as Row[];
    } finally {
      options.signal?.removeEventListener("abort", abort);
      if (options.signal?.aborted) connection.destroy();
      else connection.release();
    }
  }

  async execSql(
    sql: string,
    parameters: SqlParameter[],
    options: SqlExecutionOptions,
  ): Promise<SqlExecutionResult> {
    options.signal?.throwIfAborted();
    const connection = await this.pool.getConnection();
    const abort = () => connection.destroy();
    options.signal?.addEventListener("abort", abort, { once: true });
    try {
      options.signal?.throwIfAborted();
      await connection.query(
        options.readOnly ? "START TRANSACTION READ ONLY" : "START TRANSACTION",
      );
      const [result, fields] = await connection.execute<
        RowDataPacket[] | ResultSetHeader
      >({ sql, rowsAsArray: true }, parameters);
      options.signal?.throwIfAborted();
      await connection.commit();
      return {
        columns: fields?.map((field) => field.name) ?? [],
        rows: Array.isArray(result)
          ? (result.slice(0, 1000) as unknown[][])
          : [],
        affectedRows: Array.isArray(result) ? null : result.affectedRows,
        truncated: Array.isArray(result) && result.length > 1000,
      };
    } catch (error) {
      if (!options.signal?.aborted) await connection.rollback().catch(() => {});
      throw error;
    } finally {
      options.signal?.removeEventListener("abort", abort);
      // A custom statement may change session state. Never return it to the pool.
      connection.destroy();
    }
  }

  async getAllColumnsInDatabase(): Promise<TableColumn[]> {
    const [columns] = await this.pool.query<RowDataPacket[]>(`
    SELECT DISTINCT
    table_name AS table_name,
    table_schema AS table_schema,
    column_name AS column_name,
    is_nullable AS is_nullable,
    data_type AS data_type,
    constraint_type AS constraint_type

    FROM information_schema.columns
    LEFT JOIN (
      SELECT
      tc.table_schema, tc.table_name, column_name, constraint_type
      FROM
      information_schema.table_constraints AS tc
      JOIN
      information_schema.key_column_usage AS kcu
      USING (constraint_schema, constraint_name)
      WHERE constraint_type = 'PRIMARY KEY'
    ) AS tc
    USING (table_schema, table_name, column_name)

    WHERE table_schema NOT IN ('information_schema', 'sys', 'mysql', 'performance_schema')
    `);

    return sortBy(
      uniqBy(
        columns.map((columnInfo) => ({
          name: columnInfo.column_name,
          tableName: columnInfo.table_name,
          schemaName: columnInfo.table_schema,
          dataType: columnInfo.data_type,
          genericDataType: mysqlDatatypeToGenericDatatype(columnInfo.data_type),
          isNullable: columnInfo.is_nullable === "YES",
          includedInPrimaryKey: columnInfo.constraint_type === "PRIMARY KEY",
        })),
        (col) => `${col.schemaName}.${col.tableName}.${col.name}`,
      ),
      (col) => `${col.schemaName}.${col.tableName}.${col.name}`,
    );
  }

  async getAllForeignKeysInDatabase(): Promise<Relationship[]> {
    const [foreignKeys] = await this.pool.query<RowDataPacket[]>(`
    SELECT
    tc.constraint_name AS constraint_name,
    kcu.table_schema AS table_schema,
    kcu.table_name AS table_name,
    kcu.column_name AS column_name,
    kcu.ordinal_position AS ordinal_position,
    kcu.referenced_table_schema AS foreign_table_schema,
    kcu.referenced_table_name AS foreign_table_name,
    kcu.referenced_column_name AS foreign_column_name

    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu USING (constraint_schema, constraint_name, table_name)

    WHERE kcu.table_schema NOT IN ('information_schema', 'pg_catalog')
    AND tc.constraint_type = 'FOREIGN KEY';
    `);

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
      await this.pool.end();
    }));
  }
}

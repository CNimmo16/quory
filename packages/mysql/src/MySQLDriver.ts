import type {
  DatabaseDriver,
  Relationship,
  Row,
  TableColumn,
} from "@quory/core";
import mysqlDatatypeToGenericDatatype from "./util/mysqlDatatypeToGenericDatatype";
import mysql, { Pool, PoolOptions, RowDataPacket } from "mysql2/promise";
import { sortBy, uniqBy } from "lodash";

export class MySQLDriver implements DatabaseDriver {
  pool: Pool;
  constructor(poolConfig: PoolOptions) {
    this.pool = mysql.createPool(poolConfig);
  }

  async testConnection() {
    await this.pool.query("SELECT 1");
  }

  exec(sql: string): Promise<Row[]> {
    return this.pool.query(sql).then(() => {
      return [{}];
    });
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
        (col) => `${col.schemaName}.${col.tableName}.${col.name}`
      ),
      (col) => `${col.schemaName}.${col.tableName}.${col.name}`
    );
  }

  async getAllForeignKeysInDatabase(): Promise<Relationship[]> {
    const [foreignKeys] = await this.pool.query<RowDataPacket[]>(`
    SELECT
    tc.constraint_name AS constraint_name,
    kcu.table_schema AS table_schema,
    kcu.table_name AS table_name,
    kcu.column_name AS column_name,
    kcu.referenced_table_schema AS foreign_table_schema,
    kcu.referenced_table_name AS foreign_table_name,
    kcu.referenced_column_name AS foreign_column_name

    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu USING (constraint_schema, constraint_name)

    WHERE kcu.table_schema NOT IN ('information_schema', 'pg_catalog')
    AND tc.constraint_type = 'FOREIGN KEY';
    `);

    return foreignKeys.map((constraintInfo) => ({
      localSchema: constraintInfo.table_schema,
      localTable: constraintInfo.table_name,
      localColumn: constraintInfo.column_name,
      foreignSchema: constraintInfo.foreign_table_schema,
      foreignTable: constraintInfo.foreign_table_name,
      foreignColumn: constraintInfo.foreign_column_name,
    }));
  }

  async teardown() {
    await this.pool.end();
  }
}

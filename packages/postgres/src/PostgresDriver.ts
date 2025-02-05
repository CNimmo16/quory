import postgres from "postgres";
import type {
  DatabaseDriver,
  Relationship,
  Row,
  TableColumn,
} from "@quory/core";
import postgresDatatypeToGenericDatatype from "./util/postgresDatatypeToGenericDatatype";

export class PostgresDriver implements DatabaseDriver {
  sql: postgres.Sql;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(config: postgres.Options<Record<string, any>>) {
    this.sql = postgres(config);
  }

  async testConnection() {
    await this.sql`SELECT 1`;
  }

  exec(sql: string): Promise<Row[]> {
    return this.sql.unsafe(sql).then((rows) => {
      return rows;
    });
  }

  async getAllColumnsInDatabase(): Promise<TableColumn[]> {
    const columns = await this.sql`
    SELECT
    table_name,
    table_schema,
    column_name,
    is_nullable,
    data_type,
    constraint_type

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

    WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
    `;

    return columns.map((columnInfo) => ({
      name: columnInfo.column_name,
      tableName: columnInfo.table_name,
      schemaName: columnInfo.table_schema,
      dataType: columnInfo.data_type,
      genericDataType: postgresDatatypeToGenericDatatype(columnInfo.data_type),
      isNullable: columnInfo.is_nullable === "YES",
      includedInPrimaryKey: columnInfo.constraint_type === "PRIMARY KEY",
    }));
  }

  async getAllForeignKeysInDatabase(): Promise<Relationship[]> {
    const foreignKeys = await this.sql`
    SELECT
    tc.table_schema, 
    tc.constraint_name, 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_schema AS foreign_table_schema,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 

    FROM information_schema.table_constraints AS tc JOIN information_schema.key_column_usage AS kcu USING (constraint_schema, constraint_name) JOIN information_schema.constraint_column_usage AS ccu USING (constraint_schema, constraint_name)

    WHERE tc.table_schema NOT IN ('information_schema', 'pg_catalog')
    AND tc.constraint_type = 'FOREIGN KEY';
    `;

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
    await this.sql.end();
  }
}

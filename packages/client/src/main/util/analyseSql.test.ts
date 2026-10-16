import { expect, it } from "vitest";
import { analyseSql } from "./analyseSql";
it.each([
  "SELECT 1",
  "-- hello\nSELECT 'DELETE; UPDATE' AS message; -- done",
  "WITH x AS (SELECT 1) SELECT * FROM x",
  'SELECT "update" FROM "delete"',
  "SELECT $tag$hello;delete$tag$",
  "SELECT 1 /* nested /* comment */ remaining */",
])("identifies a protected read: %s", (sql) =>
  expect(analyseSql(sql).readOnly).toBe(true),
);
it.each([
  "WITH x AS (DELETE FROM orders RETURNING *) SELECT * FROM x",
  "SELECT * INTO OUTFILE 'some-file' FROM orders",
  "EXPLAIN ANALYZE DELETE FROM orders",
  "CALL modify_orders()",
  "/* comment */ UPDATE orders SET total=0",
  "SELECT nextval('sequence')",
  "SELECT 1 /*!40101 INTO OUTFILE 'file' */",
])("requires write permissions: %s", (sql) =>
  expect(analyseSql(sql).readOnly).toBe(false),
);
it.each([
  "SELECT 1; DELETE FROM orders",
  "SELECT 1; SELECT 2",
  "SELECT 'unclosed",
  "/* unclosed",
  "SELECT $$unclosed",
  "BEGIN",
  "COMMIT",
])("rejects ambiguous batches and transaction escape: %s", (sql) =>
  expect(() => analyseSql(sql)).toThrow(),
);
it("handles dialect-specific comment rules", () => {
  expect(analyseSql("--comment\nSELECT 1", "postgres").readOnly).toBe(true);
  expect(analyseSql("# hello\nSELECT 1", "mysql").readOnly).toBe(true);
});

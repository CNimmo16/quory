import { createRequire } from "node:module";
import initSqlJs from "sql.js";
import { BrowserSqliteDriver } from "../src/lib/demo/sqlite";
export async function createDemoTestDatabase() {
  const require = createRequire(import.meta.url);
  const sql = await initSqlJs({
    locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
  });
  return new BrowserSqliteDriver(new sql.Database());
}

/// <reference lib="webworker" />
import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { applyToBrowserSqlite, expandDatabaseRecipe } from "./database";
import { makeBrowserQuoryHandler, type RouterPath } from "@quory/stack/browser";
import { BrowserSqliteDriver } from "./sqlite";
import { buildSuggestions } from "./suggestions";

let session: Awaited<ReturnType<typeof makeBrowserQuoryHandler>> | undefined;
let driver: BrowserSqliteDriver | undefined;
const sqliteReady = initSqlJs({ locateFile: () => wasmUrl });
self.onmessage = async ({ data: { id, method, args } }) => {
  try {
    let result: unknown;
    if (method === "prepare") {
      await sqliteReady;
      result = true;
    } else if (method === "generate") {
      if (session) await session.dispose();
      const sqlite = await sqliteReady;
      driver = new BrowserSqliteDriver(new sqlite.Database());
      try {
        if (!args.description?.trim() || args.description.length > 240)
          throw new Error("Describe your product in 240 characters or fewer.");
        self.postMessage({ progress: "creating" });
        const plan = args.recipe
          ? expandDatabaseRecipe(args.recipe)
          : args.plan;
        applyToBrowserSqlite(driver, plan);
        self.postMessage({ progress: "ready" });
        session = await makeBrowserQuoryHandler(driver);
        const suggestions = await buildSuggestions(
          driver,
          session.schemas,
          async (query) =>
            (await session!.fetchFn("queryCount", { query })).count,
        );
        const tables = session.schemas.flatMap((s) =>
          s.tables.map((table) => ({
            name: table.name,
            columns: table.columns,
            count: Number(
              driver!.rows(
                `SELECT COUNT(*) AS count FROM "${table.name.replaceAll('"', '""')}"`,
              )[0]!.count,
            ),
          })),
        );
        // Enable database-enforced read protection after creating the records.
        driver.run("PRAGMA query_only = ON");
        result = { schemas: session.schemas, suggestions, tables };
      } catch (error) {
        await driver.teardown();
        driver = undefined;
        session = undefined;
        throw error;
      }
    } else {
      if (!session || !driver) throw new Error("Create a database first.");
      if (method === "request")
        result = await session.fetchFn(args.path as RouterPath, args.data);
      else throw new Error("Unknown demo operation.");
    }
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({
      id,
      error:
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.",
    });
  }
};

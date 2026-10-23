import { describe, expect, it } from "vitest";
import { applyToBrowserSqlite, validateDatabasePlan } from "./demo/database";
import { makeBrowserQuoryHandler } from "../../../../packages/stack/src/browser";
import { createDemoTestDatabase as database } from "../../test/demo-database";
import { buildSuggestions, tableQuery } from "./demo/suggestions";
import { examplePlan, exampleProducts } from "./demo/examples";
import { prepareQuery, type JoinDef } from "@quory/core";

describe("browser demo with real WASM SQLite and Stack", () => {
  it.each(exampleProducts)(
    "creates and queries the $id example, verifying every suggested value",
    async ({ id }) => {
      const driver = await database();
      const plan = examplePlan(id);
      expect(plan.tables).toHaveLength(8);
      expect(
        Object.values(plan.rowsByTable).reduce((n, rows) => n + rows.length, 0),
      ).toBeGreaterThan(300);
      applyToBrowserSqlite(driver, plan);
      const handler = await makeBrowserQuoryHandler(driver);
      try {
        const suggestions = await buildSuggestions(
          driver,
          handler.schemas,
          async (query) =>
            (await handler.fetchFn("queryCount", { query })).count,
        );
        expect(suggestions).toHaveLength(4);
        const depth = (join: JoinDef): number =>
          1 + Math.max(0, ...(join.joins ?? []).map(depth));
        expect(suggestions.some((s) => depth(s.query.base) >= 4)).toBe(true);
        expect(
          suggestions.some((s) => s.detail === "Investigate a support issue"),
        ).toBe(true);
        expect(suggestions.some((s) => s.label.includes("@example.com"))).toBe(
          true,
        );
        for (const suggestion of suggestions) {
          expect(suggestion.query.base.joins?.length).toBeGreaterThan(0);
          const compiled = await prepareQuery(
            handler.schemas,
            suggestion.query,
            "sqlite",
          );
          expect(compiled.sql).toMatch(/\bJOIN\b/);
          const result = await handler.fetchFn("query", {
            query: suggestion.query,
          });
          expect(result.rows.length).toBeGreaterThan(0);
          expect(suggestion.count).toBeGreaterThan(0);
          if (suggestion.label.includes("@example.com")) {
            const email = suggestion.label.split(" ").at(-1);
            expect(
              result.rows.every((row) =>
                row.flat().some((cell) => cell.rawValue === email),
              ),
            ).toBe(true);
          }
        }
        expect(driver.rows("PRAGMA foreign_key_check")).toEqual([]);
        const all = await handler.fetchFn("query", {
          query: tableQuery("customers"),
        });
        expect(all.rows).toHaveLength(plan.rowsByTable.customers!.length);
        const page = await handler.fetchFn("query", {
          query: { ...tableQuery("customers"), limit: 3, offset: 3 },
        });
        expect(page.rows).toHaveLength(3);
        expect(page.rows[0]![0]![0]!.rawValue).toBe(4);
      } finally {
        await handler.dispose();
      }
      await expect(
        handler.fetchFn("query", { query: tableQuery("customers") }),
      ).rejects.toThrow("disposed");
    },
  );
  it("offers only executable joined fallbacks when the schema has no email or status columns", async () => {
    const driver = await database();
    const plan = examplePlan("shop");
    for (const table of plan.tables) {
      for (const column of table.columns) {
        if (!["email", "status"].includes(column.name)) continue;
        const previous = column.name;
        column.name = previous === "email" ? "contact" : "phase";
        for (const row of plan.rowsByTable[table.name]!) {
          row[column.name] = row[previous]!;
          delete row[previous];
        }
      }
    }
    applyToBrowserSqlite(driver, plan);
    const handler = await makeBrowserQuoryHandler(driver);
    try {
      const suggestions = await buildSuggestions(
        driver,
        handler.schemas,
        async (query) => (await handler.fetchFn("queryCount", { query })).count,
      );
      expect(suggestions).toHaveLength(4);
      for (const suggestion of suggestions) {
        expect(
          (await prepareQuery(handler.schemas, suggestion.query, "sqlite")).sql,
        ).toMatch(/\bJOIN\b/);
        expect(
          (await handler.fetchFn("query", { query: suggestion.query })).rows
            .length,
        ).toBeGreaterThan(0);
      }
    } finally {
      await handler.dispose();
    }
  });
  it("does not fall back to single-table suggestions when tables have no relationships", async () => {
    const driver = await database();
    driver.run("CREATE TABLE customers (id INTEGER PRIMARY KEY, email TEXT)");
    driver.run("INSERT INTO customers VALUES (1, 'alex@example.com')");
    driver.run("CREATE TABLE orders (id INTEGER PRIMARY KEY, status TEXT)");
    driver.run("INSERT INTO orders VALUES (1, 'failed')");
    const handler = await makeBrowserQuoryHandler(driver);
    try {
      expect(
        await buildSuggestions(
          driver,
          handler.schemas,
          async (query) =>
            (await handler.fetchFn("queryCount", { query })).count,
        ),
      ).toEqual([]);
    } finally {
      await handler.dispose();
    }
  });
  it("rejects missing foreign-key values before mutating the database", async () => {
    const driver = await database();
    const plan = examplePlan("shop");
    plan.rowsByTable.orders![0]!.customer_id = 999;
    expect(() => applyToBrowserSqlite(driver, plan)).toThrow(
      "Foreign key value",
    );
    expect(
      driver.rows("SELECT name FROM sqlite_master WHERE type='table'"),
    ).toEqual([]);
    await driver.teardown();
  });
  it("rolls back a partially created database and preserves parameterized values", async () => {
    const driver = await database();
    const plan = examplePlan("shop");
    plan.rowsByTable.customers![0]!.name = "O'Connor; DROP TABLE customers; --";
    applyToBrowserSqlite(driver, plan);
    expect(
      driver.rows("SELECT name FROM customers WHERE id = ?", [1])[0]!.name,
    ).toBe("O'Connor; DROP TABLE customers; --");
    expect(() => applyToBrowserSqlite(driver, plan)).toThrow();
    expect(
      driver.rows("SELECT COUNT(*) AS count FROM customers")[0]!.count,
    ).toBe(16);
    driver.run("PRAGMA query_only = ON");
    await expect(driver.exec("DELETE FROM customers")).rejects.toThrow();
    await driver.teardown();
  });
  it("rejects duplicate and unsafe schema identifiers", () => {
    const plan = examplePlan("shop");
    plan.tables[0]!.name = 'customers"; DROP TABLE orders;--';
    expect(() => validateDatabasePlan(plan)).toThrow();
  });
  it("cancels an active browser transport request and rejects unknown routes", async () => {
    const driver = await database();
    applyToBrowserSqlite(driver, examplePlan("shop"));
    const handler = await makeBrowserQuoryHandler(driver);
    await expect(handler.fetchFn("toString", {})).rejects.toThrow(
      "Unknown Quory route",
    );
    driver.exec = async (_sql, _parameters, options) =>
      new Promise((_resolve, reject) => {
        options?.signal?.addEventListener(
          "abort",
          () => reject(options.signal?.reason),
          { once: true },
        );
      });
    const controller = new AbortController();
    const pending = handler.fetchFn(
      "query",
      { query: tableQuery("customers") },
      controller.signal,
    );
    controller.abort();
    await expect(pending).rejects.toThrow("cancelled");
    await Promise.all([handler.dispose(), handler.dispose()]);
  });
});

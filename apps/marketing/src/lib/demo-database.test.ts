import { describe, expect, it, vi } from "vitest";
import {
  applyToBrowserSqlite,
  expandDatabaseRecipe,
  validateDatabaseRecipe,
} from "./demo/database";
import { makeBrowserQuoryHandler } from "@quory/stack/browser";
import { generationPlan } from "../../test/generation-plan";
import { createDemoTestDatabase } from "../../test/demo-database";
import { buildSuggestions } from "./demo/suggestions";

describe("compact generation", () => {
  it("builds real SQLite data, relationships and executable suggestions through the demo generator and Stack", async () => {
    const driver = await createDemoTestDatabase();
    const plan = expandDatabaseRecipe(generationPlan());
    expect(plan.tables).toHaveLength(8);
    expect(
      Object.values(plan.rowsByTable).reduce((n, rows) => n + rows.length, 0),
    ).toBeGreaterThan(300);
    applyToBrowserSqlite(driver, plan);
    const handler = await makeBrowserQuoryHandler(driver);
    try {
      expect(driver.rows("PRAGMA foreign_key_check")).toEqual([]);
      expect(
        driver.rows("SELECT paid, amount FROM payments WHERE id = 1")[0],
      ).toEqual({ paid: 0, amount: 42 });
      const suggestions = await buildSuggestions(
        driver,
        handler.schemas,
        async (query) => (await handler.fetchFn("queryCount", { query })).count,
      );
      expect(suggestions).toHaveLength(4);
      expect(
        suggestions.some((s) =>
          s.label.includes(String(plan.rowsByTable.customers![0]!.email)),
        ),
      ).toBe(true);
      for (const suggestion of suggestions) {
        const result = await handler.fetchFn("query", {
          query: suggestion.query,
        });
        expect(result.rows.length).toBeGreaterThan(0);
        expect(result.rows.length).toBe(suggestion.count);
      }
    } finally {
      await handler.dispose();
    }
  });
  it("rejects explicit IDs, duplicate columns and broken references", () => {
    const id = generationPlan();
    id.tables[0]!.columns[0]![0] = "id";
    expect(() => validateDatabaseRecipe(id)).toThrow();
    const duplicate = generationPlan();
    duplicate.tables[0]!.columns[1]![0] = "name";
    expect(() => validateDatabaseRecipe(duplicate)).toThrow(
      "Duplicate columns",
    );
    const reference = generationPlan();
    reference.tables[2]!.columns[0]![1] = "@missing_table";
    expect(() => validateDatabaseRecipe(reference)).toThrow("earlier table");
  });

  it("creates fresh people each time while preserving matching emails and shared ownership", async () => {
    const recipe = generationPlan();
    // Use two reproducible shuffles so this assertion cannot fail by chance.
    const random = vi.spyOn(Math, "random");
    let plan: ReturnType<typeof expandDatabaseRecipe>;
    try {
      random.mockReturnValue(0);
      plan = expandDatabaseRecipe(recipe);
      random.mockReturnValue(0.5);
      const next = expandDatabaseRecipe(recipe);
      expect(next.rowsByTable.customers).not.toEqual(
        plan.rowsByTable.customers,
      );
      expect(next.tables).toEqual(plan.tables);
    } finally {
      random.mockRestore();
    }
    const customers = plan.rowsByTable.customers!;
    expect(new Set(customers.map((row) => row.name)).size).toBe(
      customers.length,
    );
    expect(new Set(customers.map((row) => row.email)).size).toBe(
      customers.length,
    );
    for (const row of customers)
      expect(row.email).toBe(
        `${String(row.name).toLowerCase().replaceAll(" ", ".")}@example.com`,
      );
    const driver = await createDemoTestDatabase();
    try {
      applyToBrowserSqlite(driver, plan);
      expect(
        driver.rows(
          "SELECT COUNT(*) AS count FROM tickets t JOIN orders o ON o.id = t.order_id WHERE t.customer_id <> o.customer_id",
        )[0]!.count,
      ).toBe(0);
      expect(
        driver.rows(
          "SELECT COUNT(*) AS count FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.amount <> o.total",
        )[0]!.count,
      ).toBe(0);
    } finally {
      await driver.teardown();
    }
  });

  it("rejects cycles, disconnected tables and oversized recipes before creating a database", () => {
    const cyclic = generationPlan();
    cyclic.tables[0]!.columns.push(["order_id", "@orders"]);
    expect(() => validateDatabaseRecipe(cyclic)).toThrow("earlier table");
    const disconnected = generationPlan();
    disconnected.tables.push({
      name: "unrelated",
      columns: [
        ["active", true],
        ["name", ["A", "B"]],
      ],
    });
    expect(() => validateDatabaseRecipe(disconnected)).toThrow("connected");
    const oversized = generationPlan();
    oversized.tables.push(...oversized.tables.slice(0, 3));
    expect(() => validateDatabaseRecipe(oversized)).toThrow();
  });

  it("preserves zero and false when expanding and inserting related records", async () => {
    const recipe = generationPlan();
    recipe.tables
      .find((table) => table.name === "orders")!
      .columns.find(([name]) => name === "total")![1] = 0;
    const driver = await createDemoTestDatabase();
    try {
      applyToBrowserSqlite(driver, expandDatabaseRecipe(recipe));
      expect(
        driver.rows("SELECT amount, paid FROM payments WHERE id = 1")[0],
      ).toEqual({ amount: 0, paid: 0 });
      expect(driver.rows("PRAGMA foreign_key_check")).toEqual([]);
    } finally {
      await driver.teardown();
    }
  });
});
